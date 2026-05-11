-- Run in Supabase SQL editor after teachers / students / lectures / lecture_access exist.
-- Tracks resumable Drive upload + post-processing state.

create table if not exists public.upload_jobs (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  status text not null default 'queued',
  progress_percent int not null default 0 check (progress_percent >= 0 and progress_percent <= 100),
  total_bytes bigint,
  uploaded_bytes bigint not null default 0,
  resumable_url text,
  google_file_name text,
  mime_type text,
  lecture_title text,
  subject text,
  chapter text,
  google_drive_file_id text,
  lecture_id uuid references public.lectures (id) on delete set null,
  idempotency_key text unique,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_upload_jobs_teacher_id on public.upload_jobs (teacher_id);
create index if not exists idx_upload_jobs_status on public.upload_jobs (status);
create index if not exists idx_upload_jobs_created_at on public.upload_jobs (created_at desc);
