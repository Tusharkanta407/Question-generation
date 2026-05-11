import "dotenv/config";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

type SourcePageRow = {
  id: string;
  source_url: string;
  exam: string | null;
  year: number | null;
};

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function toAbsoluteUrl(url: string): string {
  if (url.startsWith("http")) return url;
  return `https://questions.examside.com${url}`;
}

function inferMetaFromPageUrl(pageUrl: string) {
  const parts = pageUrl.split("/").filter(Boolean);
  const idx = parts.findIndex((p) => p === "past-years");
  const examSlug = idx >= 0 && parts[idx + 2] ? parts[idx + 2] : null;
  const subject = idx >= 0 && parts[idx + 3] ? parts[idx + 3] : null;
  const chapter = idx >= 0 && parts[idx + 4] ? parts[idx + 4] : null;
  return { subject, chapter, examSlug };
}

function inferYearFromQuestionText(text: string): number | null {
  const match = text.match(/\b(20\d{2}|19\d{2})\b/);
  if (!match) return null;
  const year = Number(match[1]);
  return Number.isFinite(year) ? year : null;
}

function extractQuestionUrlsFromHtml(rawHtml: string): string[] {
  const links = new Set<string>();

  const absoluteMatches = rawHtml.match(/https:\/\/questions\.examside\.com\/past-years\/jee\/question\/[a-z0-9\-_.]+/gi) ?? [];
  absoluteMatches.forEach((link) => links.add(link));

  const relativeMatches = rawHtml.match(/\/past-years\/jee\/question\/[a-z0-9\-_.]+/gi) ?? [];
  relativeMatches.forEach((link) => links.add(toAbsoluteUrl(link)));

  const escapedMatches =
    rawHtml.match(/\\u002Fpast-years\\u002Fjee\\u002Fquestion\\u002F[a-z0-9\-_.]+/gi) ?? [];
  escapedMatches.forEach((link) => {
    const decoded = link.replace(/\\u002F/g, "/");
    links.add(toAbsoluteUrl(decoded));
  });

  return Array.from(links);
}

function textFromQuestionUrl(questionUrl: string): string {
  const slug = questionUrl.split("/").pop() ?? "";
  const readable = slug
    .replace(/-[a-z0-9]{10,}(\.htm)?$/i, "")
    .replace(/-/g, " ")
    .trim();
  return normalizeText(readable || slug);
}

async function main() {
  const maxPagesRaw = process.argv[2] || "200";
  const offsetRaw = process.argv[3] || "0";
  const maxPages = Number(maxPagesRaw);
  const offset = Number(offsetRaw);
  if (!Number.isFinite(maxPages) || maxPages <= 0) {
    throw new Error(`Invalid maxPages: ${maxPagesRaw}`);
  }
  if (!Number.isFinite(offset) || offset < 0) {
    throw new Error(`Invalid offset: ${offsetRaw}`);
  }

  const supabaseUrl = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: sourcePages, error } = await supabase
    .from("question_source_pages")
    .select("id,source_url,exam,year")
    .eq("source_name", "examside")
    .order("created_at", { ascending: false })
    .range(offset, offset + maxPages - 1);

  if (error) {
    throw new Error(`Failed to load source pages: ${error.message}`);
  }

  const pages = (sourcePages ?? []) as SourcePageRow[];
  if (!pages.length) {
    console.log("No source pages found.");
    return;
  }

  let totalExtracted = 0;
  let totalUpserted = 0;

  for (const page of pages) {
    const { data: pageHtmlRow, error: pageHtmlError } = await supabase
      .from("question_source_pages")
      .select("raw_html")
      .eq("id", page.id)
      .single();

    if (pageHtmlError) {
      console.error(`Skipped page ${page.source_url}: ${pageHtmlError.message}`);
      continue;
    }

    const rawHtml = pageHtmlRow?.raw_html;
    if (!rawHtml) continue;

    const { subject, chapter, examSlug } = inferMetaFromPageUrl(page.source_url);
    const examName = page.exam ?? examSlug ?? "jee";

    const rows: Array<Record<string, unknown>> = [];
    const questionUrls = extractQuestionUrlsFromHtml(rawHtml);

    questionUrls.forEach((questionUrl) => {
      const questionText = textFromQuestionUrl(questionUrl);
      const year = inferYearFromQuestionText(questionText) ?? page.year;
      const dedupHash = createHash("sha256")
        .update(`examside|${questionUrl}`)
        .digest("hex");

      rows.push({
        exam: examName,
        subject,
        year,
        shift: null,
        question_number: null,
        question_text: questionText,
        options: null,
        correct_answer: null,
        source_name: "examside",
        source_url: questionUrl,
        quality_status: "scraped_text_only",
        dedup_hash: dedupHash,
        metadata: {
          parser: "parseExamsideLinksToQuestions",
          source_page_url: page.source_url,
          chapter,
        },
      });
    });

    totalExtracted += rows.length;
    if (!rows.length) continue;

    const { data: upserted, error: upsertError } = await supabase
      .from("question_bank")
      .upsert(rows, { onConflict: "dedup_hash", ignoreDuplicates: false })
      .select("id");

    if (upsertError) {
      throw new Error(`Failed upserting from ${page.source_url}: ${upsertError.message}`);
    }

    totalUpserted += upserted?.length ?? 0;
    console.log(
      `Parsed page: ${page.source_url} | extracted=${rows.length}, upserted=${upserted?.length ?? 0}`
    );
  }

  console.log(`Done. extracted=${totalExtracted}, upserted=${totalUpserted}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
