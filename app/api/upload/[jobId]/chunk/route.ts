import { supabaseAdmin } from "@/src/server/db/supabaseAdmin";
import { putDriveResumableChunk } from "@/src/server/drive/resumableUpload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function parseContentRange(header: string | null): {
  start: number;
  end: number;
  total: number | null;
} | null {
  if (!header) return null;
  const m = /^bytes (\d+)-(\d+)\/(\d+|\*)$/.exec(header.trim());
  if (!m) return null;
  const total = m[3] === "*" ? null : Number(m[3]);
  return { start: Number(m[1]), end: Number(m[2]), total };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await context.params;
  const range = parseContentRange(request.headers.get("content-range"));
  if (!range) {
    return Response.json(
      {
        error:
          'Missing or invalid Content-Range header (expected e.g. bytes 0-524287/9000000)',
      },
      { status: 400 }
    );
  }

  const { data: job, error: jobErr } = await supabaseAdmin
    .from("upload_jobs")
    .select("*")
    .eq("id", jobId)
    .single();

  if (jobErr || !job) {
    return Response.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.status !== "uploading") {
    return Response.json(
      { error: `Job is not accepting chunks (status=${job.status})` },
      { status: 409 }
    );
  }

  const sessionUrl = job.resumable_url as string | null;
  if (!sessionUrl) {
    return Response.json({ error: "Job missing resumable session" }, { status: 500 });
  }

  const total =
    range.total ?? (job.total_bytes as number | null);
  if (total == null || total <= 0) {
    return Response.json({ error: "Cannot determine total file size" }, { status: 400 });
  }

  const buf = Buffer.from(await request.arrayBuffer());
  const expectedLen = range.end - range.start + 1;
  if (buf.length !== expectedLen) {
    return Response.json(
      {
        error: `Body size ${buf.length} does not match Content-Range length ${expectedLen}`,
      },
      { status: 400 }
    );
  }

  const mimeType = (job.mime_type as string) || "video/mp4";

  try {
    const result = await putDriveResumableChunk({
      sessionUrl,
      chunk: buf,
      start: range.start,
      end: range.end,
      total,
      mimeType,
    });

    const uploaded = Math.min(range.end + 1, total);
    const progress = Math.min(90, Math.floor((uploaded / total) * 90));

    if (result.complete && result.fileId) {
      await supabaseAdmin
        .from("upload_jobs")
        .update({
          status: "uploaded",
          google_drive_file_id: result.fileId,
          uploaded_bytes: total,
          progress_percent: 90,
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);

      return Response.json({
        complete: true,
        fileId: result.fileId,
        progressPercent: 90,
      });
    }

    await supabaseAdmin
      .from("upload_jobs")
      .update({
        uploaded_bytes: uploaded,
        progress_percent: progress,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    return Response.json({
      complete: false,
      progressPercent: progress,
      uploadedBytes: uploaded,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await supabaseAdmin
      .from("upload_jobs")
      .update({
        status: "failed",
        error: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);
    return Response.json({ error: message }, { status: 500 });
  }
}
