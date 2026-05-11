import { createHash, randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/src/server/db/supabaseAdmin";
import { getTeacherDrive } from "@/src/server/drive/teacherOAuthDrive";
import { sendLectureAccessEmail } from "@/src/server/email/mailer";

function getEnv(name: string): string | undefined {
  const v = process.env[name];
  if (!v?.trim()) return undefined;
  return v.trim();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetries<T>(
  fn: () => Promise<T>,
  attempts: number,
  baseDelayMs: number
): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (i < attempts - 1) {
        await sleep(baseDelayMs * Math.pow(2, i));
      }
    }
  }
  throw last;
}

async function ensureStudent(
  teacherId: string,
  email: string,
  name?: string | null
): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const { data: existing } = await supabaseAdmin
    .from("students")
    .select("id")
    .eq("teacher_id", teacherId)
    .eq("email", normalized)
    .maybeSingle();

  if (existing?.id) {
    return existing.id as string;
  }

  const { data: created, error } = await supabaseAdmin
    .from("students")
    .insert({
      teacher_id: teacherId,
      email: normalized,
      name: name?.trim() || null,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to create student: ${error.message}`);
  }
  return created!.id as string;
}

function previewUrl(fileId: string) {
  return `https://drive.google.com/file/d/${fileId}/preview`;
}

async function sendEmailWithRetry(input: Parameters<typeof sendLectureAccessEmail>[0]) {
  return withRetries(() => sendLectureAccessEmail(input), 3, 400);
}

async function insertLectureAccessRow(input: {
  lectureId: string;
  studentId: string;
  token: string;
}) {
  const ttlHoursRaw = getEnv("LECTURE_TOKEN_TTL_HOURS") ?? "72";
  const ttlHours = Number(ttlHoursRaw);
  const hours = Number.isFinite(ttlHours) && ttlHours > 0 ? ttlHours : 72;
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

  // Your table uses token_hash, not a raw token column.
  // Store only a hash; the raw token is what we email to the student.
  const tokenHash = createHash("sha256").update(input.token).digest("hex");

  const { error } = await supabaseAdmin.from("lecture_access").insert({
    lecture_id: input.lectureId,
    student_id: input.studentId,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });
  if (error) {
    throw new Error(error.message || "Failed to insert lecture access");
  }
}

export async function finalizeUploadJob(input: {
  jobId: string;
  recipients: { email: string; name?: string | null }[];
}) {
  const appUrl = getEnv("APP_URL") ?? "http://localhost:3000";

  const { data: job, error: jobErr } = await supabaseAdmin
    .from("upload_jobs")
    .select("*")
    .eq("id", input.jobId)
    .single();

  if (jobErr || !job) {
    throw new Error(jobErr?.message || "Job not found");
  }

  if (job.status === "completed") {
    return { lectureId: job.lecture_id as string | null, skipped: true as const };
  }

  if (job.status !== "uploaded" || !job.google_drive_file_id) {
    throw new Error("Upload not finished or missing file id");
  }

  const recipients = input.recipients.filter((r) => r.email?.trim());

  const fileId = job.google_drive_file_id as string;
  const teacherId = job.teacher_id as string;

  const { data: teacherAuth, error: authErr } = await supabaseAdmin
    .from("teachers")
    .select("google_refresh_token")
    .eq("id", teacherId)
    .single();

  if (authErr || !teacherAuth?.google_refresh_token) {
    throw new Error(
      authErr?.message ||
        "Teacher Google Drive not connected (missing google_refresh_token)"
    );
  }

  await supabaseAdmin
    .from("upload_jobs")
    .update({
      status: "finalizing",
      updated_at: new Date().toISOString(),
      progress_percent: 92,
    })
    .eq("id", input.jobId);

  await withRetries(async () => {
    const drive = await getTeacherDrive(teacherAuth.google_refresh_token as string);
    await drive.permissions.create({
      fileId,
      requestBody: { type: "anyone", role: "reader" },
      supportsAllDrives: true,
    });
  }, 3, 800);

  const { data: lecture, error: lecErr } = await supabaseAdmin
    .from("lectures")
    .insert({
      teacher_id: teacherId,
      title: job.lecture_title || job.google_file_name || "Untitled lecture",
      subject: job.subject || null,
      chapter: job.chapter || null,
      google_drive_file_id: fileId,
      google_drive_preview_url: previewUrl(fileId),
    })
    .select("id")
    .single();

  if (lecErr || !lecture) {
    throw new Error(lecErr?.message || "Failed to insert lecture");
  }

  const lectureId = lecture.id as string;

  await supabaseAdmin
    .from("upload_jobs")
    .update({
      lecture_id: lectureId,
      status: recipients.length ? "distributing" : "completed",
      progress_percent: recipients.length ? 95 : 100,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.jobId);

  if (recipients.length === 0) {
    return { lectureId, emailsSent: 0, skipped: false as const };
  }

  const batchSize = 10;
  const concurrency = 5;
  let sent = 0;

  for (let i = 0; i < recipients.length; i += batchSize) {
    const batch = recipients.slice(i, i + batchSize);
    for (let j = 0; j < batch.length; j += concurrency) {
      const slice = batch.slice(j, j + concurrency);
      await Promise.all(
        slice.map(async (r) => {
          const studentId = await ensureStudent(teacherId, r.email, r.name ?? null);
          const token = randomBytes(24).toString("hex");
          await insertLectureAccessRow({ lectureId, studentId, token });
          const watchUrl = `${appUrl}/watch/${token}`;
          await sendEmailWithRetry({
            to: r.email.trim(),
            studentName: r.name ?? undefined,
            lectureTitle: (job.lecture_title as string) || "Lecture",
            watchUrl,
          });
          sent += 1;
        })
      );
    }
    const pct = 95 + Math.min(4, Math.floor((sent / Math.max(recipients.length, 1)) * 4));
    await supabaseAdmin
      .from("upload_jobs")
      .update({
        progress_percent: pct,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.jobId);
  }

  await supabaseAdmin
    .from("upload_jobs")
    .update({
      status: "completed",
      progress_percent: 100,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.jobId);

  return { lectureId, emailsSent: sent, skipped: false as const };
}
