import "dotenv/config";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import * as cheerio from "cheerio";

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function absoluteUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith("http")) return pathOrUrl;
  return `https://questions.examside.com${pathOrUrl}`;
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
  const listingUrl =
    process.argv[2] || "https://questions.examside.com/past-years/year-wise/jee/jee-main";
  const maxPagesRaw = process.argv[3] || "40";
  const maxPages = Number(maxPagesRaw);
  if (!Number.isFinite(maxPages) || maxPages <= 0) {
    throw new Error(`Invalid maxPages: ${maxPagesRaw}`);
  }

  const supabaseUrl = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const html = await fetchHtml(listingUrl);
  const $ = cheerio.load(html);

  const links = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    if (!href.includes("/past-years/")) return;
    if (href.includes("/year-wise/")) return;
    links.add(absoluteUrl(href));
  });

  const pageLinks = Array.from(links).slice(0, maxPages);
  console.log(`Discovered ${pageLinks.length} candidate pages`);

  let saved = 0;
  for (const url of pageLinks) {
    try {
      const pageHtml = await fetchHtml(url);
      const contentHash = createHash("sha256").update(pageHtml).digest("hex");
      const yearMatch = url.match(/\/(20\d{2}|19\d{2})\//);
      const year = yearMatch ? Number(yearMatch[1]) : null;

      const { error } = await supabase.from("question_source_pages").upsert(
        {
          source_name: "examside",
          source_url: url,
          exam: "jee_main",
          language: "english",
          year,
          shift: null,
          raw_html: pageHtml,
          content_hash: contentHash,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: "source_url", ignoreDuplicates: false }
      );
      if (error) {
        throw new Error(error.message);
      }
      saved += 1;
      console.log(`Saved page ${saved}/${pageLinks.length}: ${url}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Skipped ${url}: ${message}`);
    }
  }

  console.log(`Done. stored_pages=${saved}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
