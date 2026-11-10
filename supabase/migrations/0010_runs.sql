-- Runs: GPS-tracked in the app (source = 'gps') or logged by hand (source = 'manual').
-- The id is generated on the client so a run recorded offline can be queued and
-- upserted later without ever creating a duplicate.

create table public.runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  -- Active time (paused periods excluded) and the part of it spent actually moving.
  duration_s integer not null check (duration_s >= 0),
  moving_time_s integer check (moving_time_s >= 0),
  distance_m numeric(10, 1) not null check (distance_m >= 0),
  elevation_gain_m integer,
  calories_kcal integer,
  source text not null default 'gps' check (source in ('gps', 'manual')),
  -- Seconds during which no GPS fix arrived (screen locked, tunnel...). Distance across a
  -- gap is a straight-line estimate, so the UI flags runs where this is non-zero.
  gps_gap_s integer not null default 0 check (gps_gap_s >= 0),
  -- Simplified track: [[lat, lng, seconds_since_start, altitude|null, new_segment 0|1], ...]
  route jsonb,
  -- Full kilometres: [{ "index": 1, "distance_m": 1000, "time_s": 342 }, ...]
  splits jsonb,
  created_at timestamptz not null default now()
);

create index runs_user_started_idx on public.runs (user_id, started_at desc);

alter table public.runs enable row level security;

create policy "runs owner all" on public.runs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
