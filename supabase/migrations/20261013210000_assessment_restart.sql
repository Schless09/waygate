alter table public.trial_assessments
  add column if not exists restart_count integer not null default 0 check (restart_count between 0 and 1),
  add column if not exists restarted_at timestamptz,
  add column if not exists discarded_attempts jsonb;
