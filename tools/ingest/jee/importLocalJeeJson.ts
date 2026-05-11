import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

type LocalDataset = Record<string, Array<{ question?: string; options?: string[] }>>;

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function hashQuestion(exam: string, subject: string, questionText: string, options: string[]) {
  const normalized = `${exam}|${subject}|${normalizeText(questionText).toLowerCase()}|${options
    .map((o) => normalizeText(o).toLowerCase())
    .join("|")}`;
  return createHash("sha256").update(normalized).digest("hex");
}

function mapOptions(options: string[]) {
  const keys = ["A", "B", "C", "D", "E", "F"];
  const normalized = options
    .map((v) => normalizeText(String(v ?? "")))
    .filter((v) => v.length > 0 && v.toLowerCase() !== "nan");
  if (!normalized.length) return null;
  const mapped: Record<string, string> = {};
  normalized.forEach((value, idx) => {
    if (idx < keys.length) mapped[keys[idx]] = value;
  });
  return Object.keys(mapped).length ? mapped : null;
}

async function main() {
  const inputPath = process.argv[2] || "datasets/jee/jee.json";
  const maxPerSubjectRaw = process.argv[3] || "300";
  const maxPerSubject = Number(maxPerSubjectRaw);
  if (!Number.isFinite(maxPerSubject) || maxPerSubject <= 0) {
    throw new Error(`Invalid maxPerSubject: ${maxPerSubjectRaw}`);
  }

  const supabaseUrl = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const raw = readFileSync(inputPath, "utf-8");
  const dataset = JSON.parse(raw) as LocalDataset;

  let attempted = 0;
  let inserted = 0;

  for (const [subjectRaw, items] of Object.entries(dataset)) {
    const subject = normalizeText(subjectRaw || "unknown");
    const slice = items.slice(0, maxPerSubject);

    const rows = slice
      .map((item, idx) => {
        const questionText = normalizeText(String(item.question ?? ""));
        if (!questionText) return null;
        const options = item.options?.map((v) => String(v ?? "")) ?? [];
        const mappedOptions = mapOptions(options);
        return {
          exam: "jee_mixed",
          subject,
          year: null as number | null,
          shift: null as string | null,
          question_number: idx + 1,
          question_text: questionText,
          options: mappedOptions,
          correct_answer: null as string | null,
          source_name: "local_jee_json",
          source_url: null as string | null,
          quality_status: "imported",
          dedup_hash: hashQuestion("jee_mixed", subject, questionText, options),
          metadata: { import_file: inputPath },
        };
      })
      .filter((row): row is NonNullable<typeof row> => !!row);

    attempted += rows.length;
    if (!rows.length) continue;

    const { data, error } = await supabase
      .from("question_bank")
      .upsert(rows, { onConflict: "dedup_hash", ignoreDuplicates: false })
      .select("id");

    if (error) {
      throw new Error(`Failed inserting subject ${subject}: ${error.message}`);
    }
    inserted += data?.length ?? 0;
    console.log(`Imported subject ${subject}: attempted=${rows.length}, upserted=${data?.length ?? 0}`);
  }

  console.log(`Done. attempted=${attempted}, upserted=${inserted}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
