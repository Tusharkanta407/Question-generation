/**
 * PDF → JSON Question Extractor
 * 
 * Usage:
 *   npx tsx tools/pdf-to-json/extract.ts "path/to/file.pdf"              # Uses OpenRouter
 *   npx tsx tools/pdf-to-json/extract.ts "path/to/file.pdf" --ollama     # Uses local Ollama
 * 
 * Output: Creates a JSON file with extracted questions
 */
import "dotenv/config";
import { readFileSync, writeFileSync } from "fs";
import { basename } from "path";
import { PDFParse } from "pdf-parse";
import { OpenRouter } from "@openrouter/sdk";

const OPENROUTER_MODEL = "openai/gpt-4o-mini";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "mistral";
const OLLAMA_URL = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";

const EXTRACTION_PROMPT = `You are a question extraction assistant. Extract ALL questions from the given text.

Return ONLY a valid JSON array. No markdown, no explanation, no code blocks.

Each question must follow this structure:
{
  "question_number": 1,
  "question_text": "The full question text here",
  "options": {
    "A": "First option",
    "B": "Second option", 
    "C": "Third option",
    "D": "Fourth option"
  },
  "correct_answer": "A",
  "question_type": "mcq",
  "subject": "Physics",
  "chapter": "Mechanics",
  "difficulty": "medium"
}

Rules:
- question_type: "mcq" for multiple choice, "integer" for numerical answer, "subjective" for text answer
- If options don't exist, set options to null
- For integer type, correct_answer should be the number as string
- subject: "Physics", "Chemistry", "Math", or "Biology"
- Guess the chapter based on content
- difficulty: "easy", "medium", or "hard" based on complexity
- Extract EVERY question you find, don't skip any

Extract from this text:
`;

async function extractTextFromPdf(pdfPath: string): Promise<string> {
  console.log(`📄 Reading PDF: ${pdfPath}`);
  const data = readFileSync(pdfPath);
  const parser = new PDFParse({ data: new Uint8Array(data) });
  try {
    const result = await parser.getText();
    return result.text ?? "";
  } finally {
    await parser.destroy();
  }
}

function extractJsonFromResponse(content: string): any[] {
  // Try to extract JSON array from response
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.error("❌ No JSON array found in response");
    console.log("Raw response (first 500 chars):", content.slice(0, 500));
    return [];
  }

  try {
    const questions = JSON.parse(jsonMatch[0]);
    return Array.isArray(questions) ? questions : [];
  } catch (e) {
    console.error("❌ Failed to parse JSON:", e);
    return [];
  }
}

async function extractWithOpenRouter(text: string): Promise<any[]> {
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Set OPENROUTER_API_KEY in .env");
  }

  const openrouter = new OpenRouter({ apiKey });
  
  // Truncate if too long
  const maxChars = 30000;
  const truncated = text.length > maxChars ? text.slice(0, maxChars) + "\n[TRUNCATED]" : text;
  
  console.log(`🤖 Sending to OpenRouter (${truncated.length} chars)...`);
  
  const response = await openrouter.chat.send({
    chatRequest: {
      model: OPENROUTER_MODEL,
      messages: [{ role: "user", content: EXTRACTION_PROMPT + truncated }],
    },
  });

  const content = response.choices?.[0]?.message?.content ?? "";
  return extractJsonFromResponse(content);
}

async function extractWithOllama(text: string): Promise<any[]> {
  console.log(`🦙 Sending to Ollama (${text.length} chars, no truncation)...`);
  console.log(`   Model: ${OLLAMA_MODEL} @ ${OLLAMA_URL}`);
  
  const response = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt: EXTRACTION_PROMPT + text,
      stream: false,
      options: {
        temperature: 0.1,
        num_predict: 8000,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as { response?: string };
  const content = data.response ?? "";
  return extractJsonFromResponse(content);
}

async function main() {
  const args = process.argv.slice(2);
  const pdfPath = args.find(a => !a.startsWith("--"));
  const useOllama = args.includes("--ollama");
  
  if (!pdfPath) {
    console.log("Usage:");
    console.log("  npx tsx tools/pdf-to-json/extract.ts <path-to-pdf>");
    console.log("  npx tsx tools/pdf-to-json/extract.ts <path-to-pdf> --ollama");
    process.exit(1);
  }

  // Extract text
  const text = await extractTextFromPdf(pdfPath);
  console.log(`📝 Extracted ${text.length} characters`);

  // Extract questions
  const questions = useOllama 
    ? await extractWithOllama(text)
    : await extractWithOpenRouter(text);
    
  console.log(`✅ Extracted ${questions.length} questions`);

  // Save output
  const outputName = basename(pdfPath, ".pdf") + "_questions.json";
  const outputPath = `tools/pdf-to-json/${outputName}`;
  
  writeFileSync(outputPath, JSON.stringify(questions, null, 2));
  console.log(`💾 Saved to: ${outputPath}`);

  // Preview first question
  if (questions.length > 0) {
    console.log("\n📋 First question preview:");
    console.log(JSON.stringify(questions[0], null, 2));
  }
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
