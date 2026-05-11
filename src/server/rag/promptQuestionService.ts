import { OpenRouter } from "@openrouter/sdk";
import { supabaseAdmin } from "@/src/server/db/supabaseAdmin";

export type PromptFilters = {
  topic: string;
  count: number;
  subject: "physics" | "chemistry" | "mathematics" | null;
};

type QuestionRow = {
  id: string;
  question_text: string;
  options: Record<string, string> | null;
  source_url: string | null;
  subject: string | null;
  quality_status?: string | null;
  source?: "pyq" | "trending";
};

export type PromptQuestion = {
  index: number;
  question: string;
  options: Record<string, string> | null;
  link: string | null;
  subject: string | null;
  source: "pyq" | "trending";
};

export type PromptQueryResult = {
  prompt: string;
  filters: PromptFilters;
  total: number;
  questions: PromptQuestion[];
};

function getOpenRouterKey(): string {
  const key = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || "";
  if (!key) throw new Error("Missing OPENROUTER_API_KEY");
  return key;
}

function clampCount(raw: number | undefined): number {
  if (!Number.isFinite(raw)) return 10;
  return Math.max(1, Math.min(50, Math.round(raw ?? 10)));
}

function detectSubject(text: string): PromptFilters["subject"] {
  const lower = text.toLowerCase();
  if (/\bphysics\b/.test(lower)) return "physics";
  if (/\bchemistry\b/.test(lower)) return "chemistry";
  if (/\bmath(s|ematics)?\b/.test(lower)) return "mathematics";
  return null;
}

function heuristicFilters(prompt: string): PromptFilters {
  const countMatch = prompt.match(/\b(\d{1,2})\b/);
  const count = clampCount(countMatch ? Number(countMatch[1]) : 10);
  const subject = detectSubject(prompt);
  const cleaned = prompt
    .replace(/\b(give|show|select|pull|provide|problems?|questions?|mcq|numerical|on|topic|of)\b/gi, " ")
    .replace(/\b\d{1,2}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { topic: cleaned || "mechanics", count, subject };
}

async function parsePromptWithLLM(prompt: string): Promise<PromptFilters> {
  const openrouter = new OpenRouter({ apiKey: getOpenRouterKey() });
  const model = process.env.OPENROUTER_QUERY_MODEL || "openai/gpt-4o-mini";
  const response = await openrouter.chat.send({
    chatRequest: {
      model,
      messages: [
        {
          role: "system",
          content:
            'Extract search filters from user prompt. Return ONLY JSON: {"topic":"string","count":10,"subject":"physics|chemistry|mathematics|null"}. Keep topic concise.',
        },
        { role: "user", content: prompt },
      ],
      temperature: 0,
    },
  });

  const content = response.choices?.[0]?.message?.content ?? "";
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return heuristicFilters(prompt);

  try {
    const parsed = JSON.parse(match[0]) as Partial<PromptFilters>;
    const topic = String(parsed.topic ?? "").trim() || heuristicFilters(prompt).topic;
    const subject =
      parsed.subject === "physics" || parsed.subject === "chemistry" || parsed.subject === "mathematics"
        ? parsed.subject
        : detectSubject(prompt);
    return { topic, count: clampCount(parsed.count), subject };
  } catch {
    return heuristicFilters(prompt);
  }
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function topicTokens(topic: string): string[] {
  const stop = new Set([
    "question",
    "questions",
    "problem",
    "problems",
    "mcq",
    "numerical",
    "give",
    "show",
    "from",
  ]);
  return normalize(topic)
    .split(" ")
    .filter((token) => token.length > 2 && !stop.has(token));
}

function inferSubjectFromUrl(url: string | null): PromptFilters["subject"] {
  const lower = (url ?? "").toLowerCase();
  if (lower.includes("-jee-main-physics-")) return "physics";
  if (lower.includes("-jee-main-chemistry-")) return "chemistry";
  if (lower.includes("-jee-main-mathematics-")) return "mathematics";
  return null;
}

function inferSubject(row: QuestionRow): PromptFilters["subject"] {
  const fromUrl = inferSubjectFromUrl(row.source_url);
  if (fromUrl) return fromUrl;
  const lower = (row.subject ?? "").toLowerCase();
  if (lower.includes("physics")) return "physics";
  if (lower.includes("chem")) return "chemistry";
  if (lower.includes("math")) return "mathematics";
  return null;
}

function sanitizeQuestionText(text: string): string {
  return text
    .replace(/ExamSIDE\s*\(Powered by ExamGOAL\)[\s\S]*?PREVIOUS\s+NEXT/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Plural/singular and light variants so "thermodynamics" matches "thermodynamic" and URLs like heat-and-thermodynamics. */
function tokenMatchVariants(token: string): string[] {
  const out = new Set<string>([token]);
  if (token.length > 5 && token.endsWith("s")) {
    out.add(token.slice(0, -1));
  }
  if (token.length > 5 && !token.endsWith("s")) {
    out.add(`${token}s`);
  }
  return [...out];
}

function countTopicHits(haystack: string, tokens: string[]): number {
  let hits = 0;
  for (const token of tokens) {
    let matched = false;
    for (const variant of tokenMatchVariants(token)) {
      if (variant.length >= 3 && haystack.includes(variant)) {
        matched = true;
        break;
      }
    }
    if (matched) hits += 1;
  }
  return hits;
}

function scoreQuestion(row: QuestionRow, topic: string, subject: PromptFilters["subject"]): number {
  const inferredSubject = inferSubject(row);
  if (subject && inferredSubject && inferredSubject !== subject) {
    return 0;
  }

  const tokens = topicTokens(topic);
  if (!tokens.length) return 0;

  const cleanText = sanitizeQuestionText(row.question_text);
  const haystack = `${cleanText} ${row.source_url ?? ""}`.toLowerCase();
  const topicHits = countTopicHits(haystack, tokens);
  if (topicHits === 0) return 0;

  let score = topicHits * 3;
  if (row.options && Object.keys(row.options).length >= 4) score += 3;
  if (subject && inferredSubject === subject) score += 2;
  if ((row.quality_status ?? "") === "detail_parsed") score += 2;
  if (row.source === "trending") score += 1;
  return score;
}

/**
 * When the model leaves subject null, infer a narrow JEE subject from topic text so backfill
 * does not mix physics/chemistry/math blindly.
 */
function inferSubjectHintFromTopic(topic: string): PromptFilters["subject"] {
  const n = normalize(topic);
  if (!n) return null;
  if (
    /\bthermodynam/.test(n) ||
    /\bkinematic/.test(n) ||
    /\brotat/.test(n) ||
    /\bgravitation/.test(n) ||
    /\bwave\b/.test(n) ||
    /\boptic/.test(n) ||
    /\belectrostatic/.test(n) ||
    /\bmagnetic\b/.test(n) ||
    /\bcurrent\b/.test(n) ||
    /\bpulley\b/.test(n)
  ) {
    return "physics";
  }
  if (
    /\borganic\b/.test(n) ||
    /\binorganic\b/.test(n) ||
    /\bmole\b/.test(n) ||
    /\bequilibrium\b/.test(n) ||
    /\belectrochem/.test(n) ||
    /\bthermochem/.test(n)
  ) {
    return "chemistry";
  }
  if (/\bcalculus\b/.test(n) || /\bintegrat/.test(n) || /\bdifferentiat/.test(n) || /\bmatrices\b/.test(n)) {
    return "mathematics";
  }
  return null;
}

/** When topic-specific matches are fewer than requested count: same-subject rows ranked by quality (no topic gate). */
function scoreSubjectBackfill(row: QuestionRow, subject: NonNullable<PromptFilters["subject"]>): number {
  const inferredSubject = inferSubject(row);
  if (!inferredSubject || inferredSubject !== subject) return 0;
  let score = 1;
  if (row.options && Object.keys(row.options).length >= 4) score += 4;
  if ((row.quality_status ?? "") === "detail_parsed") score += 3;
  if (row.source === "trending") score += 1;
  return score;
}

async function loadPyqCandidates(): Promise<QuestionRow[]> {
  const baseQuery = supabaseAdmin
    .from("question_bank_ready")
    .select("id,question_text,options,source_url,subject,quality_status")
    .eq("quality_status", "detail_parsed")
    .not("options", "is", null)
    .limit(2000);

  const { data, error } = await baseQuery;
  if (error) {
    const fallback = await supabaseAdmin
      .from("question_bank")
      .select("id,question_text,options,source_url,subject,quality_status")
      .eq("source_name", "examside")
      .eq("quality_status", "detail_parsed")
      .not("options", "is", null)
      .limit(2000);
    if (fallback.error) {
      throw new Error(fallback.error.message);
    }
    return ((fallback.data ?? []) as QuestionRow[]).map((row) => ({ ...row, source: "pyq" }));
  }
  return ((data ?? []) as QuestionRow[]).map((row) => ({ ...row, source: "pyq" }));
}

async function loadTrendingCandidates(): Promise<QuestionRow[]> {
  const base = await supabaseAdmin
    .from("trending_questions_ready")
    .select("id,question_text,options,source_url,subject,quality_status")
    .in("quality_status", ["detail_parsed", "detail_text_only"])
    .limit(2000);

  if (base.error) {
    const fallback = await supabaseAdmin
      .from("trending_questions")
      .select("id,question_text,options,source_url,subject,quality_status")
      .in("quality_status", ["detail_parsed", "detail_text_only"])
      .limit(2000);
    if (fallback.error) {
      throw new Error(fallback.error.message);
    }
    return ((fallback.data ?? []) as QuestionRow[]).map((row) => ({ ...row, source: "trending" }));
  }

  return ((base.data ?? []) as QuestionRow[]).map((row) => ({ ...row, source: "trending" }));
}

function deterministicFormatQuestionText(text: string): string {
  return sanitizeQuestionText(text)
    .replace(/\bPREVIOUS\b|\bNEXT\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function formatQuestionsWithSmallModel(questions: PromptQuestion[]): Promise<PromptQuestion[]> {
  if (!questions.length) return [];
  const openrouter = new OpenRouter({ apiKey: getOpenRouterKey() });
  const model = process.env.OPENROUTER_FORMAT_MODEL || "openai/gpt-4o-mini";
  const response = await openrouter.chat.send({
    chatRequest: {
      model,
      messages: [
        {
          role: "system",
          content:
            "Rewrite question text for readability. Do NOT change facts, options values, links, subject, or source. Return ONLY JSON array with same objects and keys.",
        },
        { role: "user", content: JSON.stringify(questions) },
      ],
      temperature: 0.1,
    },
  });

  const content = response.choices?.[0]?.message?.content ?? "";
  const match = content.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("Formatter returned non-JSON output");
  const parsed = JSON.parse(match[0]) as PromptQuestion[];
  if (!Array.isArray(parsed) || parsed.length !== questions.length) {
    throw new Error("Formatter output length mismatch");
  }
  return parsed.map((q, idx) => ({
    ...questions[idx],
    question: deterministicFormatQuestionText(String(q.question ?? questions[idx].question)),
  }));
}

function pickAdaptiveMix(
  pyq: Array<{ row: QuestionRow; score: number }>,
  trending: Array<{ row: QuestionRow; score: number }>,
  totalCount: number
): Array<{ row: QuestionRow; score: number }> {
  const targetPyq = Math.floor(totalCount / 2);
  const targetTrending = totalCount - targetPyq;
  const pickPyq = pyq.slice(0, targetPyq);
  const pickTrending = trending.slice(0, targetTrending);
  const picked = [...pickPyq, ...pickTrending];
  if (picked.length < totalCount) {
    const remainingPyq = pyq.slice(pickPyq.length);
    const remainingTrending = trending.slice(pickTrending.length);
    const pool = [...remainingPyq, ...remainingTrending].sort((a, b) => b.score - a.score);
    picked.push(...pool.slice(0, totalCount - picked.length));
  }
  return picked.slice(0, totalCount);
}

function mergePicked(
  primary: Array<{ row: QuestionRow; score: number }>,
  pyqCandidates: QuestionRow[],
  trendingCandidates: QuestionRow[],
  need: number,
  subjectForBackfill: NonNullable<PromptFilters["subject"]>
): Array<{ row: QuestionRow; score: number }> {
  if (need <= 0) return primary;
  const pickedIds = new Set(primary.map((p) => p.row.id));
  const pyqBack = pyqCandidates
    .filter((row) => !pickedIds.has(row.id))
    .map((row) => ({
      row: { ...row, source: "pyq" as const },
      score: scoreSubjectBackfill(row, subjectForBackfill),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  const trendingBack = trendingCandidates
    .filter((row) => !pickedIds.has(row.id))
    .map((row) => ({
      row: { ...row, source: "trending" as const },
      score: scoreSubjectBackfill(row, subjectForBackfill),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  const filler = pickAdaptiveMix(pyqBack, trendingBack, need);
  return [...primary, ...filler];
}

export async function queryQuestionsByPrompt(prompt: string): Promise<PromptQueryResult> {
  const cleanPrompt = String(prompt ?? "").trim();
  if (!cleanPrompt) throw new Error("prompt is required");

  const filters = await parsePromptWithLLM(cleanPrompt);
  const [pyqCandidates, trendingCandidates] = await Promise.all([
    loadPyqCandidates(),
    loadTrendingCandidates(),
  ]);

  const pyqScored = pyqCandidates
    .map((row) => ({ row, score: scoreQuestion(row, filters.topic, filters.subject) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const trendingScored = trendingCandidates
    .map((row) => ({ row, score: scoreQuestion(row, filters.topic, filters.subject) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  let mixed = pickAdaptiveMix(pyqScored, trendingScored, filters.count);
  const subjectForBackfill = filters.subject ?? inferSubjectHintFromTopic(filters.topic);
  if (mixed.length < filters.count && subjectForBackfill) {
    mixed = mergePicked(
      mixed,
      pyqCandidates,
      trendingCandidates,
      filters.count - mixed.length,
      subjectForBackfill
    );
  }
  let questions: PromptQuestion[] = mixed.map((item, index) => ({
    index: index + 1,
    question: deterministicFormatQuestionText(item.row.question_text) || item.row.question_text,
    options: item.row.options,
    link: item.row.source_url,
    subject: inferSubject(item.row) || item.row.subject,
    source: item.row.source ?? "pyq",
  }));

  try {
    questions = await formatQuestionsWithSmallModel(questions);
  } catch {
    // deterministic formatting already applied above
  }

  return {
    prompt: cleanPrompt,
    filters,
    total: questions.length,
    questions,
  };
}
