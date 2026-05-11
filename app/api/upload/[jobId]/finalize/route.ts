import { finalizeUploadJob } from "@/src/server/upload/finalizeUploadJob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type FinalizeBody = {
  recipients?: { email: string; name?: string | null }[];
};

export async function POST(
  request: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await context.params;
  let body: FinalizeBody = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text) as FinalizeBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const recipients = Array.isArray(body.recipients) ? body.recipients : [];

  try {
    const result = await finalizeUploadJob({ jobId, recipients });
    return Response.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message }, { status: 500 });
  }
}
