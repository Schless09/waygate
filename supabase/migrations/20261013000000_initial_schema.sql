create extension if not exists pgcrypto;

create table public.trial_candidates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  session_token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.trial_clips (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  audio_path text not null,
  duration_seconds integer not null check (duration_seconds > 0),
  speaker_count integer not null check (speaker_count between 1 and 4),
  reference_utterances jsonb not null,
  reference_text text not null,
  qa_source_transcript text,
  qa_error_key jsonb,
  difficulty text not null check (difficulty in ('standard', 'hard')),
  role text not null default 'annotator' check (role in ('annotator', 'qa')),
  sort_order integer not null,
  unique (role, sort_order)
);

create table public.trial_assessments (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.trial_candidates(id) on delete cascade,
  role text not null check (role in ('annotator', 'qa')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (candidate_id, role)
);

create table public.trial_attempts (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.trial_candidates(id) on delete cascade,
  assessment_id uuid not null references public.trial_assessments(id) on delete cascade,
  clip_id uuid not null references public.trial_clips(id) on delete restrict,
  started_at timestamptz not null,
  submitted_at timestamptz,
  active_seconds integer check (active_seconds >= 0),
  transcript text,
  telemetry jsonb,
  qa_review jsonb,
  unique (assessment_id, clip_id),
  check (submitted_at is null or submitted_at >= started_at)
);

create table public.trial_scores (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null unique references public.trial_attempts(id) on delete cascade,
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

create index trial_attempts_candidate_id_idx on public.trial_attempts(candidate_id);
create index trial_attempts_assessment_id_idx on public.trial_attempts(assessment_id);
create index trial_attempts_clip_id_idx on public.trial_attempts(clip_id);
create index trial_clips_sort_order_idx on public.trial_clips(sort_order);

alter table public.trial_candidates enable row level security;
alter table public.trial_clips enable row level security;
alter table public.trial_assessments enable row level security;
alter table public.trial_attempts enable row level security;
alter table public.trial_scores enable row level security;

-- Deliberately no public RLS policies. The service role used only by server routes
-- bypasses RLS; browser clients receive no database credentials or reference data.

insert into storage.buckets (id, name, public)
values ('trial-audio', 'trial-audio', false)
on conflict (id) do update set public = false;
