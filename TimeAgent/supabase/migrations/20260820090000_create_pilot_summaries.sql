-- Phase 0 validation aggregates, one row per tester account.
-- The app no longer shows these back to anyone: the Plus preview screen sends them when it closes
-- and the operator reads them as pilot statistics. Only counts and rates are stored — no schedule
-- title, place, coordinate, or event timestamp ever reaches this table.
--
-- RLS is enabled with no policies on purpose: only the mobility edge function (service role) reads
-- or writes, after verifying the caller's Google ID token.
create table public.pilot_summaries (
  user_id text primary key,
  segment text not null check (segment in ('student', 'worker', 'variable-routine', 'prefer-not-to-answer')),
  completed_schedules integer not null default 0 check (completed_schedules >= 0),
  -- Rates are percentages and stay null while nothing has been measured yet, so an account with no
  -- data reads as unmeasured rather than as a real 0%.
  schedule_completion_rate integer check (schedule_completion_rate between 0 and 100),
  notification_start_rate integer check (notification_start_rate between 0 and 100),
  delay_apply_rate integer check (delay_apply_rate between 0 and 100),
  delay_reject_rate integer check (delay_reject_rate between 0 and 100),
  average_step_error_minutes numeric check (average_step_error_minutes >= 0),
  on_time_arrival_rate integer check (on_time_arrival_rate between 0 and 100),
  plus_offer_views integer not null default 0 check (plus_offer_views >= 0),
  plus_interest_selections integer not null default 0 check (plus_interest_selections >= 0),
  plus_interest_withdrawals integer not null default 0 check (plus_interest_withdrawals >= 0),
  interested boolean not null default false,
  selected_plan text not null default '미등록',
  updated_at timestamptz not null default now()
);

alter table public.pilot_summaries enable row level security;

-- The operator's view is "how do the testers as a group look", which reads every row ordered by
-- how recently it changed.
create index pilot_summaries_recency on public.pilot_summaries (updated_at desc);

-- This project does not grant table privileges to service_role by default, so the edge function's
-- REST calls would be rejected with 42501. Only the service role gets access; anon and
-- authenticated stay locked out alongside RLS.
grant select, insert, update, delete on table public.pilot_summaries to service_role;
