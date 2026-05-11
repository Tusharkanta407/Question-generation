import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import * as cheerio from "cheerio";

type Row = {
  id: string;
  question_text: string;
  source_url: string | null;
  metadata: Record<string, unknown> | null;
};

type ParsedBlock = {
  questionText: string;
  options: Record<string, string> | null;
  score: number;
};

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function sanitizeQuestionText(value: string): string {
  return value
    .replace(/\bNEXT\b/gi, " ")
    .replace(/\bNumerical\b/gi, " ")
    .replace(/Your input[\s_⬅\.\-]*/gi, " ")
    .replace(/[⬅]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseBlocksFromHtml(html: string): ParsedBlock[] {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, "\n")
    .replace(/<style[\s\S]*?<\/style>/gi, "\n")
    .replace(/<\/(div|p|li|h1|h2|h3|h4|h5|h6|br|tr|td|th|button|a)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const decoded = cheerio.load(stripped).text();
  const lines = decoded
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const blocks: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    current.push(line);
    if (line.toLowerCase().includes("check answer")) {
      blocks.push(current);
      current = [];
    }
  }
  if (current.length) blocks.push(current);

  return blocks
    .map((block) => {
      const cleaned = block.filter(
        (line) =>
          !/^(english|hindi|bengali)$/i.test(line) &&
          !/^(mcq|integer|subjective)/i.test(line) &&
          !/^\+?\d+$/.test(line) &&
          !/^-?\d+$/.test(line) &&
          !/^jee main|^aieee/i.test(line)
      );

      const optionIndices: Array<{ idx: number; key: string }> = [];
      cleaned.forEach((line, idx) => {
        const match = line.match(/^([A-F])[\).]?$/);
        if (match) optionIndices.push({ idx, key: match[1] });
      });

      if (!optionIndices.length) {
        const tail = cleaned
          .slice(Math.max(0, cleaned.length - 10))
          .filter(
            (line) =>
              !/check answer/i.test(line) &&
              !/examside|powered by|joint entrance examination|previous year|take mock test|browse past year/i.test(
                line
              )
          );
        const candidate = tail.join(" ").replace(/\s+/g, " ").trim();
        const questionText = sanitizeQuestionText(candidate.replace(/\s+jee main.*$/i, "").trim());
        if (questionText.length < 25) return { questionText: "", options: null, score: 0 };
        return { questionText, options: null, score: 2 };
      }

      const preOptionLines = cleaned.slice(0, optionIndices[0].idx);
      const questionLines = preOptionLines
        .slice(Math.max(0, preOptionLines.length - 8))
        .filter(
          (line) =>
            line.toLowerCase() !== "check answer" &&
            !/examside|powered by|joint entrance examination|previous year|take mock test|browse past year/i.test(
              line
            )
        );
      const questionText = sanitizeQuestionText(questionLines.join(" ").trim());
      if (!questionText) return { questionText: "", options: null, score: 0 };

      const options: Record<string, string> = {};
      for (let i = 0; i < optionIndices.length; i += 1) {
        const start = optionIndices[i];
        const endIdx = i + 1 < optionIndices.length ? optionIndices[i + 1].idx : cleaned.length;
        const text = cleaned
          .slice(start.idx + 1, endIdx)
          .filter((line) => line.toLowerCase() !== "check answer")
          .join(" ")
          .trim();
        if (text) options[start.key] = text;
      }

      const optionCount = Object.keys(options).length;
      const score = (questionText.length > 20 ? 3 : 0) + (optionCount >= 4 ? 3 : optionCount);
      return { questionText, options: optionCount ? options : null, score };
    })
    .filter((block) => block.score > 0);
}

function similarityScore(a: string, b: string): number {
  const aTokens = new Set(normalize(a).split(" ").filter((t) => t.length > 2));
  const bTokens = new Set(normalize(b).split(" ").filter((t) => t.length > 2));
  if (!aTokens.size || !bTokens.size) return 0;
  let common = 0;
  for (const t of aTokens) {
    if (bTokens.has(t)) common += 1;
  }
  return common / Math.max(1, Math.min(aTokens.size, bTokens.size));
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
    },
  });
  if (!response.ok) throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
  return response.text();
}

async function main() {
  const limitRaw = process.argv[2] || "20";
  const offsetRaw = process.argv[3] || "0";
  const sourceUrlArgRaw = (process.argv[4] || "").trim();
  const sourceUrlArg = sourceUrlArgRaw === "-" ? "" : sourceUrlArgRaw;
  const subjectArg = (process.argv[5] || "").trim().toLowerCase();
  const limit = Number(limitRaw);
  const offset = Number(offsetRaw);
  if (!Number.isFinite(limit) || limit <= 0 || limit > 200) throw new Error("limit must be 1..200");
  if (!Number.isFinite(offset) || offset < 0) throw new Error("offset must be >= 0");

  const supabase = createClient(
    getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  let query = supabase
    .from("question_bank")
    .select("id,question_text,source_url,metadata")
    .eq("source_name", "examside")
    .not("source_url", "is", null)
    .order("created_at", { ascending: false });

  if (sourceUrlArg) {
    query = query.eq("source_url", sourceUrlArg).limit(limit);
  } else {
    query = query.eq("quality_status", "scraped_text_only");
    if (subjectArg === "physics" || subjectArg === "chemistry" || subjectArg === "mathematics") {
      query = query.ilike("source_url", `%-jee-main-${subjectArg}-%`);
    }
    query = query.range(offset, offset + limit - 1);
  }

  const { data, error } = await query;

  if (error) throw new Error(`Failed loading rows: ${error.message}`);
  const rows = (data ?? []) as Row[];
  if (!rows.length) {
    console.log("No rows to enrich.");
    return;
  }

  let updated = 0;
  let skipped = 0;
  for (const row of rows) {
    if (!row.source_url) {
      skipped += 1;
      continue;
    }
    try {
      const html = await fetchHtml(row.source_url);
      const blocks = parseBlocksFromHtml(html);
      if (!blocks.length) {
        skipped += 1;
        continue;
      }

      const ranked = blocks
        .map((b) => ({
          block: b,
          totalScore: b.score + similarityScore(row.question_text, b.questionText) * 10,
        }))
        .sort((a, b) => b.totalScore - a.totalScore);

      const best = ranked[0]?.block;
      if (!best || best.questionText.length < 20) {
        console.log(`Skipped ${row.source_url}: no parseable question text`);
        skipped += 1;
        continue;
      }

      const metadata = {
        ...(row.metadata ?? {}),
        detail_parser: "enrichExamsideQuestionDetails",
        detail_parsed_at: new Date().toISOString(),
      };

      const options = best.options && Object.keys(best.options).length >= 2 ? best.options : null;
      const qualityStatus = options ? "detail_parsed" : "detail_text_only";

      const { error: updateError } = await supabase
        .from("question_bank")
        .update({
          question_text: best.questionText,
          options,
          quality_status: qualityStatus,
          metadata,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);

      if (updateError) throw new Error(updateError.message);
      updated += 1;
      console.log(`Updated ${updated}/${rows.length}: ${row.source_url}`);
    } catch (e) {
      skipped += 1;
      const message = e instanceof Error ? e.message : String(e);
      console.log(`Skipped ${row.source_url}: ${message}`);
    }
  }

  console.log(`Done. updated=${updated}, skipped=${skipped}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
