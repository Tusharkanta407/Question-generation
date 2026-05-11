import "dotenv/config";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

type SourcePageRow = {
  source_url: string;
  raw_html: string | null;
};

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function toAbsoluteUrl(url: string): string {
  if (url.startsWith("http")) return url;
  return `https://questions.examside.com${url}`;
}

function extractChapterLinks(rawHtml: string): string[] {
  const matches = rawHtml.match(/\/past-years\/jee\/jee-main\/[a-z0-9-]+\/[a-z0-9-]+/gi) ?? [];
  const unique = Array.from(new Set(matches.map((m) => toAbsoluteUrl(m))));
  return unique;
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
    },
  });
  if (!response.ok) {
    throw new Error(`Fetch failed for ${url}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

async function main() {
  const maxSubjectPagesRaw = process.argv[2] || "100";
  const maxChapterPagesRaw = process.argv[3] || "200";
  const maxSubjectPages = Number(maxSubjectPagesRaw);
  const maxChapterPages = Number(maxChapterPagesRaw);
  if (!Number.isFinite(maxSubjectPages) || maxSubjectPages <= 0) {
    throw new Error(`Invalid maxSubjectPages: ${maxSubjectPagesRaw}`);
  }
  if (!Number.isFinite(maxChapterPages) || maxChapterPages <= 0) {
    throw new Error(`Invalid maxChapterPages: ${maxChapterPagesRaw}`);
  }

  const supabaseUrl = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: subjectPages, error } = await supabase
    .from("question_source_pages")
    .select("source_url,raw_html")
    .eq("source_name", "examside")
    .eq("exam", "jee_main")
    .like("source_url", "%/past-years/jee/jee-main/%")
    .not("raw_html", "is", null)
    .order("created_at", { ascending: false })
    .limit(maxSubjectPages);

  if (error) {
    throw new Error(`Failed loading source pages: ${error.message}`);
  }

  const pages = (subjectPages ?? []) as SourcePageRow[];
  const chapterLinks = new Set<string>();
  for (const page of pages) {
    if (!page.raw_html) continue;
    extractChapterLinks(page.raw_html).forEach((link) => chapterLinks.add(link));
  }

  const targets = Array.from(chapterLinks).slice(0, maxChapterPages);
  console.log(`Discovered chapter pages: ${targets.length}`);

  let stored = 0;
  for (const chapterUrl of targets) {
    try {
      const html = await fetchHtml(chapterUrl);
      const hash = createHash("sha256").update(html).digest("hex");

      const { error: upsertError } = await supabase.from("question_source_pages").upsert(
        {
          source_name: "examside",
          source_url: chapterUrl,
          exam: "jee_main",
          language: "english",
          year: null,
          shift: null,
          raw_html: html,
          content_hash: hash,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: "source_url", ignoreDuplicates: false }
      );

      if (upsertError) throw new Error(upsertError.message);
      stored += 1;
      console.log(`Stored chapter ${stored}/${targets.length}: ${chapterUrl}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`Skipped ${chapterUrl}: ${message}`);
    }
  }

  console.log(`Done. stored_chapter_pages=${stored}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
