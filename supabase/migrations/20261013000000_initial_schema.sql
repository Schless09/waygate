create extension if not exists pgcrypto;

create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  session_token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.clips (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  audio_path text not null,
  duration_seconds integer not null check (duration_seconds > 0),
  speaker_count integer not null check (speaker_count between 1 and 4),
  reference_utterances jsonb not null,
  reference_text text not null,
  difficulty text not null check (difficulty in ('standard', 'hard')),
  sort_order integer not null unique
);

create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  clip_id uuid not null references public.clips(id) on delete restrict,
  started_at timestamptz not null,
  submitted_at timestamptz,
  active_seconds integer check (active_seconds >= 0),
  transcript text,
  telemetry jsonb,
  unique (candidate_id, clip_id),
  check (submitted_at is null or submitted_at >= started_at)
);

create table public.scores (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null unique references public.attempts(id) on delete cascade,
  wer numeric,
  transcription_score numeric check (transcription_score between 0 and 100),
  speaker_score numeric check (speaker_score between 0 and 100),
  pace_score numeric check (pace_score between 0 and 100),
  pace_ratio numeric,
  format_score numeric check (format_score between 0 and 100),
  total_score numeric check (total_score between 0 and 100),
  claude_feedback jsonb,
  scored_at timestamptz,
  error text
);

create index attempts_candidate_id_idx on public.attempts(candidate_id);
create index attempts_clip_id_idx on public.attempts(clip_id);
create index clips_sort_order_idx on public.clips(sort_order);

alter table public.candidates enable row level security;
alter table public.clips enable row level security;
alter table public.attempts enable row level security;
alter table public.scores enable row level security;

-- Deliberately no public RLS policies. The service role used only by server routes
-- bypasses RLS; browser clients receive no database credentials or reference data.

insert into storage.buckets (id, name, public)
values ('trial-audio', 'trial-audio', false)
on conflict (id) do update set public = false;
