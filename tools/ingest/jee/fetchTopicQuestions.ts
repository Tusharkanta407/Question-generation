import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

type QuestionRow = {
  id: string;
  subject: string | null;
  question_text: string;
  source_url: string | null;
  options?: Record<string, string> | null;
  quality_status?: string | null;
  metadata: Record<string, unknown> | null;
};

function inferFromQuestionUrl(url: string | null) {
  if (!url) return { subject: "", chapter: "" };
  const match = url.match(
    /-jee-main-(physics|chemistry|mathematics)-([a-z0-9-]+)-[a-z0-9]{8,}(?:\.htm)?$/i
  );
  if (!match) return { subject: "", chapter: "" };
  return { subject: match[1].toLowerCase(), chapter: match[2].toLowerCase() };
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

async function main() {
  const topic = (process.argv[2] || "").trim();
  const subjectArg = (process.argv[3] || "").trim();
  const limitRaw = process.argv[4] || "10";
  const modeArg = (process.argv[5] || "detail").trim().toLowerCase();
  const limit = Number(limitRaw);

  if (!topic) {
    throw new Error(
      'Usage: npm run test:jee:topic -- "<topic>" [subject] [limit]\nExample: npm run test:jee:topic -- "thermodynamics" physics 10'
    );
  }
  if (!Number.isFinite(limit) || limit <= 0 || limit > 50) {
    throw new Error("Limit must be a number between 1 and 50.");
  }
  if (modeArg !== "detail" && modeArg !== "all") {
    throw new Error('mode must be either "detail" or "all".');
  }

  const supabaseUrl = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const topicNorm = normalize(topic);
  const subjectNorm = subjectArg ? normalize(subjectArg) : "";

  // Scan in chunks so search works across full dataset.
  const rows: QuestionRow[] = [];
  const chunkSize = 1000;
  const maxScan = 30000;
  for (let offset = 0; offset < maxScan; offset += chunkSize) {
    let query = supabase
      .from("question_bank")
      .select("id,subject,question_text,source_url,options,quality_status,metadata")
      .eq("source_name", "examside")
      .order("created_at", { ascending: false })
      .range(offset, offset + chunkSize - 1);

    if (modeArg === "detail") {
      query = query.eq("quality_status", "detail_parsed");
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to query Supabase: ${error.message}`);

    const batch = (data ?? []) as QuestionRow[];
    rows.push(...batch);
    if (batch.length < chunkSize) break;
  }
  const scored = rows
    .map((row) => {
      const chapterFromMeta = String((row.metadata?.chapter as string | undefined) ?? "").toLowerCase();
      const inferred = inferFromQuestionUrl(row.source_url);
      const chapter = chapterFromMeta || inferred.chapter;
      const rowSubject = String(row.subject ?? "").toLowerCase();
      const subjectText =
        rowSubject === "physics" || rowSubject === "chemistry" || rowSubject === "mathematics"
          ? rowSubject
          : inferred.subject || rowSubject;
      const text = row.question_text.toLowerCase();
      let score = 0;
      if (chapter.includes(topicNorm)) score += 3;
      if (text.includes(topicNorm)) score += 2;
      if (subjectNorm && subjectText.includes(subjectNorm)) score += 1;
      return { row, score, chapter, subjectText };
    })
    .filter((x) => !subjectNorm || x.subjectText.includes(subjectNorm))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (!scored.length) {
    console.log(
      `No questions found for topic="${topic}"${subjectNorm ? ` subject="${subjectNorm}"` : ""}${modeArg === "detail" ? ' mode="detail"' : ""}`
    );
    return;
  }

  console.log(
    `Found ${scored.length} questions for topic="${topic}"${subjectNorm ? ` subject="${subjectNorm}"` : ""} mode="${modeArg}"\n`
  );
  scored.forEach((item, index) => {
    const preview = item.row.question_text.slice(0, 180).replace(/\s+/g, " ").trim();
    const chapter = item.chapter || "unknown";
    console.log(
      `${index + 1}. [${item.row.subject ?? "unknown"} | chapter: ${chapter} | status: ${item.row.quality_status ?? "n/a"}] ${preview}\n   ${item.row.source_url ?? "no-source-url"}`
    );
    const options = item.row.options ?? null;
    if (options && Object.keys(options).length > 0) {
      const optionPreview = Object.entries(options)
        .map(([k, v]) => `${k}) ${String(v).slice(0, 60).replace(/\s+/g, " ").trim()}`)
        .join(" | ");
      console.log(`   options: ${optionPreview}`);
    }
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
