import { OpenRouter } from "@openrouter/sdk";

/** OpenRouter using OpenAI's text-embedding-3-small: 1536 dimensions */
export const RAG_EMBEDDING_MODEL = "openai/text-embedding-3-small";
/** Must match supabase/schema_rag.sql vector(1536). */
export const RAG_EMBEDDING_DIMENSION = 1536;

export function getOpenRouterApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || "";
  if (!key) {
    throw new Error("Set OPENROUTER_API_KEY for embeddings and generation.");
  }
  return key;
}

/** OpenRouter client for embeddings + generation. */
export function createOpenRouter(): OpenRouter {
  return new OpenRouter({ apiKey: getOpenRouterApiKey() });
}

/** Embed texts using OpenRouter + OpenAI text-embedding-3-small (1536 dims). */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }
  const openrouter = createOpenRouter();
  const all: number[][] = [];
  const batchSize = 50;
  
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const response = await openrouter.embeddings.generate({
      requestBody: {
        model: RAG_EMBEDDING_MODEL,
        input: batch,
        encodingFormat: "float",
      },
    });
    
    if (typeof response === "string") {
      throw new Error(`Unexpected string response from embeddings API: ${response}`);
    }
    
    for (const item of response.data) {
      const v = item.embedding;
      if (typeof v === "string") {
        throw new Error("Got base64 embedding but expected float array");
      }
      if (v.length !== RAG_EMBEDDING_DIMENSION) {
        throw new Error(
          `Unexpected embedding length ${v.length}; expected ${RAG_EMBEDDING_DIMENSION}.`,
        );
      }
      all.push(v);
    }
  }
  return all;
}
