import "dotenv/config";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import * as cheerio from "cheerio";

type TrendingRow = {
  exam: "jee_main";
  subject: string | null;
  topic: string | null;
  question_type: "mcq" | "numeric";
  question_text: string;
  options: Record<string, string> | null;
  correct_answer: string | null;
  answer_text: string | null;
  source_name: "internet_examside";
  source_url: string;
  quality_status: "detail_parsed" | "detail_text_only";
  dedup_hash: string;
  metadata: Record<string, unknown>;
  updated_at: string;
};

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function inferSubject(url: string): string | null {
  const lower = url.toLowerCase();
  if (lower.includes("-physics-")) return "physics";
  if (lower.includes("-chemistry-")) return "chemistry";
  if (lower.includes("-mathematics-")) return "mathematics";
  return null;
}

function inferTopic(url: string): string | null {
  const m = url.match(/-jee-main-(physics|chemistry|mathematics)-([a-z0-9-]+)-[a-z0-9]{8,}/i);
  if (!m) return null;
  return m[2].replace(/-/g, " ");
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
    },
  });
  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status}: ${url}`);
  }
  return response.text();
}

function extractQuestionLinks(chapterHtml: string, maxQuestions: number): string[] {
  const links = new Set<string>();
  const relativeMatches = chapterHtml.match(/\/past-years\/jee\/question\/[a-z0-9\-_.]+/gi) ?? [];
  for (const rel of relativeMatches) {
    links.add(`https://questions.examside.com${rel}`);
  }
  return Array.from(links).slice(0, maxQuestions);
}

function parseQuestionPage(html: string): { questionText: string; options: Record<string, string> | null } {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, "\n")
    .replace(/<style[\s\S]*?<\/style>/gi, "\n")
    .replace(/<\/(div|p|li|h1|h2|h3|h4|h5|h6|br|tr|td|th|button|a)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const text = cheerio.load(stripped).text();
  const lines = text
    .split("\n")
    .map((line) => normalize(line))
    .filter(Boolean)
    .filter((line) => !/^(english|hindi|bengali)$/i.test(line));

  const qIndex = lines.findIndex((line) => line.toLowerCase().includes("jee main"));
  const start = qIndex >= 0 ? qIndex + 1 : 0;
  const sliced = lines.slice(start, start + 80);

  const optionIndices: Array<{ idx: number; key: string }> = [];
  sliced.forEach((line, idx) => {
    const m = line.match(/^([A-D])[\).]?$/);
    if (m) optionIndices.push({ idx, key: m[1] });
  });

  if (!optionIndices.length) {
    const q = normalize(sliced.slice(0, 12).join(" ")).replace(/check answer[\s\S]*/i, "");
    return { questionText: q, options: null };
  }

  const questionText = normalize(sliced.slice(0, optionIndices[0].idx).join(" ")).replace(/check answer[\s\S]*/i, "");
  const options: Record<string, string> = {};
  for (let i = 0; i < optionIndices.length; i += 1) {
    const st = optionIndices[i];
    const en = i + 1 < optionIndices.length ? optionIndices[i + 1].idx : sliced.length;
    const val = normalize(sliced.slice(st.idx + 1, en).join(" ")).replace(/check answer[\s\S]*/i, "");
    if (val) options[st.key] = val;
  }

  return { questionText, options: Object.keys(options).length ? options : null };
}

async function main() {
  const chapterUrl =
    process.argv[2] ||
    "https://questions.examside.com/past-years/jee/jee-main/physics/work-power-and-energy";
  const maxQuestions = Number(process.argv[3] || "20");
  if (!Number.isFinite(maxQuestions) || maxQuestions <= 0) {
    throw new Error("maxQuestions must be positive number");
  }

  const chapterHtml = await fetchHtml(chapterUrl);
  const links = extractQuestionLinks(chapterHtml, maxQuestions);
  if (!links.length) throw new Error("No question links found on chapter page");

  const rows: TrendingRow[] = [];
  for (const link of links) {
    try {
      const html = await fetchHtml(link);
      const parsed = parseQuestionPage(html);
      if (!parsed.questionText || parsed.questionText.length < 20) continue;
      const options = parsed.options;
      rows.push({
        exam: "jee_main",
        subject: inferSubject(link),
        topic: inferTopic(link),
        question_type: options ? "mcq" : "numeric",
        question_text: parsed.questionText,
        options,
        correct_answer: null,
        answer_text: null,
        source_name: "internet_examside",
        source_url: link,
        quality_status: options ? "detail_parsed" : "detail_text_only",
        dedup_hash: createHash("sha256").update(`internet_examside|${link}`).digest("hex"),
        metadata: {
          parser: "scrapeInternetExamsideTrending",
          chapter_url: chapterUrl,
        },
        updated_at: new Date().toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`Skip ${link}: ${message}`);
    }
  }

  const supabase = createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await supabase
    .from("trending_questions")
    .upsert(rows, { onConflict: "dedup_hash", ignoreDuplicates: false })
    .select("id");
  if (error) throw new Error(error.message);
  console.log(`Chapter: ${chapterUrl}`);
  console.log(`Question links found: ${links.length}`);
  console.log(`Parsed rows: ${rows.length}`);
  console.log(`Upserted: ${data?.length ?? 0}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
