import { supabaseAdmin } from "@/src/server/db/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const { data: job, error } = await supabaseAdmin
    .from("upload_jobs")
    .select(
      "id,teacher_id,status,progress_percent,total_bytes,uploaded_bytes,lecture_title,subject,chapter,google_drive_file_id,lecture_id,error,created_at,updated_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (!job) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json({ job });
}
