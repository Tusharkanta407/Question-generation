-- Run this in Supabase SQL editor.
-- Minimal schema for immediate scraping + ingestion.

create extension if not exists pgcrypto;

create table if not exists public.question_source_pages (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  source_url text not null unique,
  exam text,
  language text,
  year int,
  shift text,
  fetched_at timestamptz not null default now(),
  raw_html text,
  content_hash text,
  created_at timestamptz not null default now()
);

create index if not exists idx_question_source_pages_exam_year
  on public.question_source_pages (exam, year);

create table if not exists public.question_bank (
  id uuid primary key default gen_random_uuid(),
  exam text not null,
  subject text,
  year int,
  shift text,
  question_number int,
  question_text text not null,
  options jsonb,
  correct_answer text,
  source_name text not null,
  source_url text,
  quality_status text not null default 'parsed',
  dedup_hash text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_question_bank_dedup_hash
  on public.question_bank (dedup_hash);

create index if not exists idx_question_bank_exam_subject_year
  on public.question_bank (exam, subject, year);

create index if not exists idx_question_bank_quality_status
  on public.question_bank (quality_status);

-- Consumable view for app/query usage.
-- Excludes noisy placeholder rows from early scraping stage.
create or replace view public.question_bank_ready as
select
  id,
  exam,
  subject,
  year,
  shift,
  question_number,
  question_text,
  options,
  correct_answer,
  source_name,
  source_url,
  quality_status,
  metadata,
  created_at,
  updated_at
from public.question_bank
where source_name = 'examside'
  and quality_status in ('detail_parsed', 'detail_text_only')
  and length(trim(question_text)) >= 25;

create table if not exists public.trending_questions (
  id uuid primary key default gen_random_uuid(),
  exam text not null default 'jee_main',
  subject text,
  topic text,
  question_type text not null default 'mcq',
  question_text text not null,
  options jsonb,
  correct_answer text,
  answer_text text,
  source_name text not null,
  source_url text not null,
  quality_status text not null default 'scraped_raw',
  dedup_hash text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_trending_questions_dedup_hash
  on public.trending_questions (dedup_hash);

create index if not exists idx_trending_questions_subject_topic
  on public.trending_questions (subject, topic);

create index if not exists idx_trending_questions_quality_status
  on public.trending_questions (quality_status);

create index if not exists idx_trending_questions_source_name
  on public.trending_questions (source_name);

create or replace view public.trending_questions_ready as
select
  id,
  exam,
  subject,
  topic,
  question_type,
  question_text,
  options,
  correct_answer,
  answer_text,
  source_name,
  source_url,
  quality_status,
  metadata,
  created_at,
  updated_at
from public.trending_questions
where quality_status in ('detail_parsed', 'detail_text_only')
  and length(trim(question_text)) >= 25;
