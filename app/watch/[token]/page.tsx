import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/src/server/db/supabaseAdmin";
import WatchEmbed from "./WatchEmbed";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Watch is token-gated only (no Google sign-in for students).
 * Anyone with the secret link can play until expiry — keep links private.
 */
export default async function WatchPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const tokenHash = hashToken(token);

  const { data: access, error: accessErr } = await supabaseAdmin
    .from("lecture_access")
    .select("lecture_id, student_id, expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (accessErr || !access) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-8">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-xl font-semibold">Invalid link</h1>
          <p className="text-sm text-zinc-400">
            This lecture link is invalid or no longer available.
          </p>
        </div>
      </div>
    );
  }

  const expiresAt = asText(access.expires_at);
  if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-8">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-xl font-semibold">Link expired</h1>
          <p className="text-sm text-zinc-400">
            This lecture access link has expired. Ask your teacher for a new link.
          </p>
        </div>
      </div>
    );
  }

  const { data: student } = await supabaseAdmin
    .from("students")
    .select("email, name")
    .eq("id", access.student_id)
    .maybeSingle();

  const welcomeLine =
    asText(student?.name) ||
    (student?.email ? student.email.trim() : null) ||
    null;

  const { data: lecture, error: lecErr } = await supabaseAdmin
    .from("lectures")
    .select("title, google_drive_file_id, google_drive_preview_url")
    .eq("id", access.lecture_id)
    .maybeSingle();

  if (lecErr || !lecture) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-8">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-xl font-semibold">Lecture missing</h1>
          <p className="text-sm text-zinc-400">
            The lecture could not be found. Ask your teacher to resend access.
          </p>
        </div>
      </div>
    );
  }

  const fileId = asText(lecture.google_drive_file_id);
  const previewUrl =
    asText(lecture.google_drive_preview_url) ||
    (fileId ? `https://drive.google.com/file/d/${fileId}/preview` : null);

  if (!previewUrl) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-8">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-xl font-semibold">Preview unavailable</h1>
          <p className="text-sm text-zinc-400">
            Drive preview URL is missing for this lecture.
          </p>
        </div>
      </div>
    );
  }

  const lectureTitle = asText(lecture.title) || "Lecture";
  const openInDriveUrl = fileId
    ? `https://drive.google.com/file/d/${fileId}/view`
    : previewUrl;
  const downloadUrl = fileId
    ? `https://drive.google.com/uc?export=download&id=${fileId}`
    : previewUrl;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-8 space-y-4">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-semibold">{lectureTitle}</h1>
        <p className="text-sm text-zinc-400">
          {welcomeLine ? (
            <>Welcome, {welcomeLine}.</>
          ) : (
            <>Welcome.</>
          )}{" "}
          This link is private — don&apos;t share it if your teacher asked you not to.
        </p>
      </div>
      <WatchEmbed
        title={lectureTitle}
        previewSrc={previewUrl}
        openInDriveUrl={openInDriveUrl}
        downloadUrl={downloadUrl}
      />
    </div>
  );
}
