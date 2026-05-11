# JEE Ingestion (Scrape + Supabase)

## 1) Create DB tables

Run `supabase/schema_question_bank.sql` in Supabase SQL editor.

## 2) Import local bootstrap dataset

From `teacher-portal`:

```bash
npm run ingest:jee:local -- "datasets/jee/jee.json" 200
```

- Arg 1: JSON path (default `datasets/jee/jee.json`)
- Arg 2: max questions per subject (default `300`)

## 3) Scrape Examside source pages into DB

```bash
npm run ingest:jee:examside-pages -- "https://questions.examside.com/past-years/year-wise/jee/jee-main" 40
```

- Arg 1: listing URL
- Arg 2: max pages to fetch and store

## 4) Parse scraped pages into question rows

```bash
npm run ingest:jee:examside-parse-links -- 200 0
```

- Arg 1: max source pages to parse
- Arg 2: offset (for pagination batches)
- Inserts question text + question URL into `question_bank`
- `quality_status = scraped_text_only` (no options/answers yet)

## 5) Enrich rows with full question text + options

```bash
npm run ingest:jee:examside-enrich-details -- 20 0
```

- Arg 1: limit (rows per batch)
- Arg 2: offset
- Arg 3: optional exact `source_url` to enrich a specific question
- Arg 4: optional subject filter (`physics`/`chemistry`/`mathematics`) when arg3 is empty
- Reads each `source_url`, parses detail page, and updates:
  - `question_text` (full extracted text)
  - `options` (A/B/C/D when available)
  - `quality_status = detail_parsed`

## 4a) (Required) Expand JEE Main subject pages to chapter pages

```bash
npm run ingest:jee:examside-chapters -- 100 200
```

- Arg 1: max subject pages to inspect
- Arg 2: max chapter pages to fetch/store
- Run this before `ingest:jee:examside-parse-links`

## Notes

- Uses env vars: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- This phase stores source pages and bootstrap question rows.
- Next phase is deterministic parsing from `question_source_pages.raw_html` into `question_bank`.

## Quick retrieval test (topic -> 10 questions)

```bash
npm run test:jee:topic -- "thermodynamics" physics 10
```

- Arg 1: topic (required)
- Arg 2: subject (optional)
- Arg 3: limit (optional, default 10)
- Arg 4: mode (optional: `detail` default, or `all`)

## Recommended DB read surface

Use this view in app queries so only cleaned rows are returned:

```sql
select *
from public.question_bank_ready
where subject ilike '%physics%'
limit 10;
```

`question_bank_ready` includes only `detail_parsed` and `detail_text_only` rows.

## Standalone prompt test (no dashboard needed)

```bash
npm run test:prompt-query -- "give 20 pulley problems from physics"
```

This runs the same prompt parsing + Supabase query logic used by `/api/rag/query`
and prints strict formatted output in terminal (question, options, link).

## Trending (AceJEE) test scrape + ingest

```bash
# 1) scrape a small sample
npm run scrape:trending:acejee:test -- "https://acejee.com/blog/category/jee-physics-questions/" 5 "tools/ingest/trending/acejee_test_output.json"

# 2) ingest parsed sample
npm run ingest:trending:acejee -- "tools/ingest/trending/acejee_test_output.json"
```

## Adaptive 15+15 retrieval behavior

- Prompt query now mixes two sources:
  - PYQ from `question_bank_ready`
  - Trending from `trending_questions_ready`
- Target split is 50/50 (15+15 when requesting 30).
- If one source is short, it backfills from the other source.
- Final response runs a small-model formatting pass with deterministic fallback.

## Validation queries

```sql
-- PYQ ready counts
select quality_status, count(*)
from public.question_bank
where source_name = 'examside'
group by quality_status
order by count(*) desc;

-- Trending ready counts
select quality_status, count(*)
from public.trending_questions
group by quality_status
order by count(*) desc;

-- Inspect ready trending rows
select subject, topic, question_text, source_url
from public.trending_questions_ready
limit 20;
```
