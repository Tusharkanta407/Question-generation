# Teacher Portal

Teacher Portal is a Next.js app for:
- uploading teacher lectures,
- sharing secure watch links with students,
- generating classroom-ready question sets from natural-language prompts.

The question pipeline combines Previous Year Questions (PYQ) and trending question sources, then returns formatted output with options and source links.

## Tech Stack

- Next.js (App Router) + React + TypeScript
- NextAuth (Google)
- Supabase (PostgreSQL)
- OpenRouter (prompt parsing + optional formatting)
- Tailwind CSS

## Question Generation Architecture

### End-to-End Flow

1. Teacher enters a prompt in Question Studio (example: `10 thermodynamics questions from physics`).
2. Frontend calls `POST /api/rag/query`.
3. Backend service parses prompt into structured filters:
   - `topic`
   - `count` (clamped)
   - `subject` (physics / chemistry / mathematics / null)
4. Service loads candidates from two clean views in Supabase:
   - `question_bank_ready` (PYQ)
   - `trending_questions_ready` (trending)
5. Candidates are scored by:
   - subject match
   - topic-token overlap
   - quality metadata (options present, quality status)
6. Adaptive mix selection:
   - target split across PYQ + trending
   - automatic backfill if one side has fewer matches
7. Output formatting:
   - deterministic cleanup always
   - optional small-model rewrite pass for readability
8. UI renders teacher-facing results:
   - question text
   - options (A/B/C/D when available)
   - source link

### Key Backend Components

- `app/api/rag/query/route.ts`  
  API route for prompt-based question retrieval.

- `src/server/rag/promptQuestionService.ts`  
  Core orchestration:
  - prompt parsing
  - candidate loading
  - scoring and ranking
  - adaptive mixing
  - formatting

- `supabase/schema_question_bank.sql`  
  Schema, views, and quality-ready query surface.

### Data Quality Model

Question rows use quality states to keep retrieval clean:
- `scraped_text_only`
- `detail_parsed`
- `detail_text_only`
- `rejected_noise`

Ready views filter noisy/incomplete data before query-time scoring.

## Student Watch Links

- Watch links are token-based (`/watch/[token]`).
- Link validity is controlled by token hash + expiry in `lecture_access`.
- Teachers still connect Google Drive for uploads.

## Local Development

### Prerequisites

- Node.js 18+ (recommended)
- npm
- Supabase project
- Google OAuth credentials
- OpenRouter API key

### Install

```bash
npm install
```

### Environment Variables

Create `.env` (or `.env.local`) with at least:

```bash
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

OPENROUTER_API_KEY=
OPENROUTER_QUERY_MODEL=openai/gpt-4o-mini
OPENROUTER_FORMAT_MODEL=openai/gpt-4o-mini

NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
```

### Run

```bash
npm run dev
```

Open: `http://localhost:3000`

## Build and Deploy

```bash
npm run build
npm start
```

For production, ensure:
- OAuth redirect URIs match deployed domain
- `NEXTAUTH_URL` matches deployed URL
- Supabase and OpenRouter env vars are set in hosting provider

## Useful Scripts

- `npm run ingest:jee:local -- "datasets/jee/jee.json" 200`
- `npm run ingest:jee:examside-pages`
- `npm run ingest:jee:examside-chapters`
- `npm run ingest:jee:examside-parse-links`
- `npm run ingest:jee:examside-enrich-details`
- `npm run scrape:trending:internet`
- `npm run test:prompt-query`

## Notes

- `.env*` is gitignored by default.
- Keep service-role keys and OAuth secrets private.
