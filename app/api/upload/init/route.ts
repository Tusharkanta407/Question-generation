import { getServerSession } from "next-auth/next";
import { authOptions } from "@/src/lib/auth";
import { supabaseAdmin } from "@/src/server/db/supabaseAdmin";
import { startDriveResumableSession } from "@/src/server/drive/resumableUpload";
import { getTeacherAccessToken } from "@/src/server/drive/teacherOAuthDrive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type InitBody = {
  teacherId?: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  lectureTitle: string;
  subject?: string;
  chapter?: string;
  idempotencyKey?: string;
};

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return Response.json(
      { error: "Sign in with Google first, then connect Drive (same login)." },
      { status: 401 }
    );
  }

  let body: InitBody;
  try {
    body = (await request.json()) as InitBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = session.user.email.trim().toLowerCase();

  const { data: teacher, error: teacherErr } = await supabaseAdmin
    .from("teachers")
    .select("id, google_refresh_token")
    .eq("email", email)
    .maybeSingle();

  if (teacherErr) {
    return Response.json({ error: teacherErr.message }, { status: 500 });
  }

  if (!teacher?.id) {
    return Response.json(
      {
        error:
          "No teacher profile for this Google account. Sign out and sign in again after we create your row, or add your email in teachers table.",
      },
      { status: 403 }
    );
  }

  if (!teacher.google_refresh_token) {
    return Response.json(
      {
        error:
          "Google Drive not connected. Click “Connect Google Drive”, approve access, then try again.",
      },
      { status: 403 }
    );
  }

  const teacherId = teacher.id as string;

  if (
    !body.fileName?.trim() ||
    !body.mimeType?.trim() ||
    typeof body.fileSize !== "number" ||
    body.fileSize <= 0
  ) {
    return Response.json(
      { error: "fileName, mimeType, and positive fileSize are required" },
      { status: 400 }
    );
  }

  if (!body.lectureTitle?.trim()) {
    return Response.json({ error: "lectureTitle is required" }, { status: 400 });
  }

  if (!body.mimeType.startsWith("video/")) {
    return Response.json({ error: "Only video uploads are allowed" }, { status: 400 });
  }

  const idempotencyKey = body.idempotencyKey?.trim();
  if (idempotencyKey) {
    const { data: existing } = await supabaseAdmin
      .from("upload_jobs")
      .select("id,status")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existing?.id && existing.status !== "failed") {
      return Response.json({ jobId: existing.id, reused: true });
    }
  }

  try {
    const accessToken = await getTeacherAccessToken(teacher.google_refresh_token as string);

    const resumableUrl = await startDriveResumableSession({
      fileName: body.fileName.trim(),
      mimeType: body.mimeType.trim(),
      fileSize: body.fileSize,
      accessToken,
    });

    const { data: row, error } = await supabaseAdmin
      .from("upload_jobs")
      .insert({
        teacher_id: teacherId,
        status: "uploading",
        progress_percent: 0,
        total_bytes: body.fileSize,
        uploaded_bytes: 0,
        resumable_url: resumableUrl,
        google_file_name: body.fileName.trim(),
        mime_type: body.mimeType.trim(),
        lecture_title: body.lectureTitle.trim(),
        subject: body.subject?.trim() || null,
        chapter: body.chapter?.trim() || null,
        idempotency_key: idempotencyKey || null,
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error || !row) {
      return Response.json(
        { error: error?.message || "Failed to create upload job" },
        { status: 500 }
      );
    }

    return Response.json({ jobId: row.id as string, reused: false });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message }, { status: 500 });
  }
}
