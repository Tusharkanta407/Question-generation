import { queryQuestionsByPrompt } from "@/src/server/rag/promptQuestionService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { prompt?: string };
    const prompt = String(body.prompt ?? "").trim();
    if (!prompt) {
      return Response.json({ error: "prompt is required" }, { status: 400 });
    }
    const result = await queryQuestionsByPrompt(prompt);
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 500 });
  }
}
