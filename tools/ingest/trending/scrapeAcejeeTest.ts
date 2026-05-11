import "dotenv/config";
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import * as cheerio from "cheerio";

type ParsedQuestion = {
  source_name: "acejee";
  source_url: string;
  subject: string | null;
  topic: string | null;
  question_type: "mcq" | "numeric";
  question_text: string;
  options: Record<string, string> | null;
  correct_answer: string | null;
  answer_text: string | null;
  dedup_hash: string;
  quality_status: "detail_parsed" | "detail_text_only";
  metadata: Record<string, unknown>;
};

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function inferSubject(url: string): string | null {
  const lower = url.toLowerCase();
  if (lower.includes("physics")) return "physics";
  if (lower.includes("chemistry")) return "chemistry";
  if (lower.includes("math")) return "mathematics";
  return null;
}

function inferTopicFromUrl(url: string): string | null {
  const slug = url.split("/").filter(Boolean).pop() ?? "";
  if (!slug) return null;
  return slug.replace(/-\d+-\d+$/, "").replace(/-/g, " ");
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
    },
  });
  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status} for ${url}`);
  }
  return response.text();
}

function stripNoise(text: string): string {
  return normalize(
    text
      .replace(/ExamSIDE[\s\S]*/gi, " ")
      .replace(/You Might Also Like[\s\S]*/gi, " ")
      .replace(/Return to Top[\s\S]*/gi, " ")
  );
}

function parseQuestionsFromPost(html: string, sourceUrl: string): ParsedQuestion[] {
  const $ = cheerio.load(html);
  const raw = stripNoise($("body").text());

  const starts = [...raw.matchAll(/\bQ\s*\.?\s*(\d{1,3})\s*[:.\-)]\s*/g)];
  if (!starts.length) return [];

  const parsed: ParsedQuestion[] = [];
  for (let i = 0; i < starts.length; i += 1) {
    const current = starts[i];
    const start = current.index ?? 0;
    const end = i + 1 < starts.length ? starts[i + 1].index ?? raw.length : raw.length;
    const chunk = normalize(raw.slice(start, end));
    if (chunk.length < 25) continue;

    const answerMatch = chunk.match(/correct answer is\s*[:\-]?\s*([A-D]|\d+(?:\.\d+)?|[^\s,.;]+)/i);
    const options: Record<string, string> = {};
    const optionRegex = /\b([A-D])\s*[:.)-]\s*(.*?)(?=\s+[A-D]\s*[:.)-]\s*|$)/gi;
    let optionFound = false;
    for (const m of chunk.matchAll(optionRegex)) {
      const key = m[1]?.toUpperCase();
      const val = normalize(m[2] ?? "");
      if (key && val.length > 0) {
        options[key] = val;
        optionFound = true;
      }
    }

    const qText = normalize(
      chunk
        .replace(/correct answer is[\s\S]*/i, "")
        .replace(/\bQ\s*\.?\s*\d{1,3}\s*[:.\-)]\s*/i, "")
    );
    if (qText.length < 20) continue;

    const question_type: "mcq" | "numeric" = optionFound ? "mcq" : "numeric";
    const dedup_hash = createHash("sha256")
      .update(`acejee|${sourceUrl}|${qText.toLowerCase()}`)
      .digest("hex");

    parsed.push({
      source_name: "acejee",
      source_url: sourceUrl,
      subject: inferSubject(sourceUrl),
      topic: inferTopicFromUrl(sourceUrl),
      question_type,
      question_text: qText,
      options: optionFound ? options : null,
      correct_answer: question_type === "mcq" && answerMatch ? String(answerMatch[1]).toUpperCase() : null,
      answer_text: answerMatch ? normalize(answerMatch[1]) : null,
      dedup_hash,
      quality_status: optionFound ? "detail_parsed" : "detail_text_only",
      metadata: {
        parser: "scrapeAcejeeTest",
      },
    });
  }
  return parsed;
}

async function discoverPostLinks(listUrl: string, maxPosts: number): Promise<string[]> {
  const html = await fetchHtml(listUrl);
  const $ = cheerio.load(html);
  const links = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = ($(el).attr("href") || "").trim();
    if (!href) return;
    if (href.startsWith("#")) return;
    const abs = href.startsWith("http") ? href : `https://acejee.com${href}`;
    if (!abs.includes("/blog/")) return;
    if (abs.includes("/category/") || abs.includes("/page/") || abs.includes("/author/")) return;
    if (abs.endsWith("/blog/")) return;
    if (abs.includes("#")) return;
    links.add(abs);
  });
  const preferred = Array.from(links).filter(
    (url) =>
      /dpp|question|important-questions|practice-problem|kinematics/i.test(url) &&
      !/sign-?up|sign-?in/i.test(url)
  );
  const ordered = preferred.length ? preferred : Array.from(links);
  return ordered.slice(0, maxPosts);
}

async function main() {
  const listUrl = process.argv[2] || "https://acejee.com/blog/category/jee-physics-questions/";
  const maxPosts = Number(process.argv[3] || "3");
  const outputPath = process.argv[4] || "tools/ingest/trending/acejee_test_output.json";
  if (!Number.isFinite(maxPosts) || maxPosts <= 0) {
    throw new Error("maxPosts should be positive");
  }

  const posts = await discoverPostLinks(listUrl, maxPosts);
  if (!posts.length) {
    throw new Error("No candidate post links discovered");
  }
  const all: ParsedQuestion[] = [];
  for (const post of posts) {
    try {
      const html = await fetchHtml(post);
      const parsed = parseQuestionsFromPost(html, post);
      all.push(...parsed);
      console.log(`Parsed ${parsed.length} from ${post}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`Skipped ${post}: ${message}`);
    }
  }

  writeFileSync(outputPath, JSON.stringify(all, null, 2));
  if (all.length === 0) {
    const fallbackUrl = "https://acejee.com/blog/physics-dpp-kinematics-1-12/";
    const html = await fetchHtml(fallbackUrl);
    const fallbackParsed = parseQuestionsFromPost(html, fallbackUrl);
    if (fallbackParsed.length) {
      writeFileSync(outputPath, JSON.stringify(fallbackParsed, null, 2));
      console.log(`Fallback parsed ${fallbackParsed.length} from ${fallbackUrl}`);
      return;
    }
  }
  console.log(`Saved ${all.length} parsed questions to ${outputPath}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
