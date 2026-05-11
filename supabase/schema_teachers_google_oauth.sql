-- Run once: store Google OAuth refresh token for each teacher (user Drive uploads).
alter table public.teachers
add column if not exists google_refresh_token text;

comment on column public.teachers.google_refresh_token is 'Google OAuth offline refresh token; encrypt at rest in production.';
