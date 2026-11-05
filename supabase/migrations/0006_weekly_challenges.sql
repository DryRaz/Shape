-- Weekly challenges — the user "bets" at the start of the week on how many
-- sport sessions they'll complete and how many calories/protein they'll take
-- in by the end of the week (Monday-Sunday, matching the app's week range).
-- Actuals are derived on read from workout_sessions/meals; only the bet
-- itself is stored, plus whether its result has been shown to the user.

create table public.weekly_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  week_start date not null,
  target_sessions smallint not null check (target_sessions >= 0),
  target_calories numeric(8, 1) not null check (target_calories >= 0),
  target_protein_g numeric(7, 1) not null check (target_protein_g >= 0),
  result_seen boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);

create index weekly_challenges_user_week_idx on public.weekly_challenges (user_id, week_start desc);

alter table public.weekly_challenges enable row level security;

create policy "weekly_challenges owner all" on public.weekly_challenges for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
