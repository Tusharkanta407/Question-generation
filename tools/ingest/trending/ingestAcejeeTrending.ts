import "dotenv/config";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

type Row = {
  source_name: string;
  source_url: string;
  subject: string | null;
  topic: string | null;
  question_type: string;
  question_text: string;
  options: Record<string, string> | null;
  correct_answer: string | null;
  answer_text: string | null;
  dedup_hash: string;
  quality_status: string;
  metadata: Record<string, unknown>;
};

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

async function main() {
  const inputPath = process.argv[2] || "tools/ingest/trending/acejee_test_output.json";
  const raw = readFileSync(inputPath, "utf-8");
  const rows = JSON.parse(raw) as Row[];
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`No rows found in ${inputPath}`);
  }

  const supabase = createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const payload = rows.map((row) => ({
    exam: "jee_main",
    subject: row.subject,
    topic: row.topic,
    question_type: row.question_type || "mcq",
    question_text: row.question_text,
    options: row.options,
    correct_answer: row.correct_answer,
    answer_text: row.answer_text,
    source_name: row.source_name || "acejee",
    source_url: row.source_url,
    quality_status: row.quality_status || "scraped_raw",
    dedup_hash: row.dedup_hash,
    metadata: row.metadata || {},
    updated_at: new Date().toISOString(),
  }));

  const { data, error } = await supabase
    .from("trending_questions")
    .upsert(payload, { onConflict: "dedup_hash", ignoreDuplicates: false })
    .select("id");

  if (error) throw new Error(error.message);
  console.log(`Upserted ${data?.length ?? 0} trending questions from ${inputPath}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
