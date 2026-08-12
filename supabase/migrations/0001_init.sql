-- Shape — initial schema
-- Habits / wellness tracking PWA: sleep, sport, nutrition, reading/spiritual time.

-- ============================================================================
-- Enums
-- ============================================================================

create type sex_type as enum ('male', 'female', 'other');
create type goal_type as enum ('lose_weight', 'maintain', 'gain_muscle', 'improve_fitness', 'wellbeing');
create type tracking_type as enum ('boolean', 'quantity');
create type habit_category as enum ('sleep', 'sport', 'nutrition', 'reading', 'spiritual', 'other');
create type meal_type as enum ('breakfast', 'lunch', 'dinner', 'snack');
create type reminder_channel as enum ('push', 'email');

-- ============================================================================
-- users — one row per authenticated user, keyed to auth.users
-- ============================================================================

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  timezone text not null default 'Africa/Nairobi',
  height_cm numeric(5, 1),
  age smallint check (age is null or age between 0 and 120),
  sex sex_type,
  goal_type goal_type,
  created_at timestamptz not null default now()
);

-- Auto-provision a users row whenever someone signs up via Supabase Auth.
create function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ============================================================================
-- weight_logs
-- ============================================================================

create table public.weight_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  date date not null,
  weight_kg numeric(5, 2) not null check (weight_kg > 0),
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

create index weight_logs_user_date_idx on public.weight_logs (user_id, date desc);

-- ============================================================================
-- habit_types — user-defined habits (reading, spiritual time, custom ones…)
-- ============================================================================

create table public.habit_types (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  name text not null,
  category habit_category not null default 'other',
  tracking_type tracking_type not null default 'boolean',
  target_value numeric(8, 2),
  target_unit text,
  reminder_time time,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index habit_types_user_idx on public.habit_types (user_id) where active;

-- ============================================================================
-- habit_logs
-- ============================================================================

create table public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  habit_type_id uuid not null references public.habit_types (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  date date not null,
  value numeric(8, 2) not null default 1,
  created_at timestamptz not null default now(),
  unique (habit_type_id, date)
);

create index habit_logs_user_date_idx on public.habit_logs (user_id, date desc);

-- ============================================================================
-- sleep_logs
-- ============================================================================

create table public.sleep_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  date date not null,
  bedtime time,
  wake_time time,
  duration_hours numeric(4, 2),
  quality_rating smallint check (quality_rating is null or quality_rating between 1 and 5),
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

create index sleep_logs_user_date_idx on public.sleep_logs (user_id, date desc);

-- ============================================================================
-- meals
-- ============================================================================

create table public.meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  date date not null default current_date,
  meal_type meal_type not null,
  photo_url text,
  estimated_calories numeric(7, 1),
  estimated_protein_g numeric(6, 1),
  estimated_carbs_g numeric(6, 1),
  estimated_fat_g numeric(6, 1),
  user_adjusted boolean not null default false,
  created_at timestamptz not null default now()
);

create index meals_user_date_idx on public.meals (user_id, date desc);

-- ============================================================================
-- exercises — shared catalog, imported from the wger API (service role only)
-- ============================================================================

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  wger_id integer unique,
  name text not null,
  muscle_group text,
  instructions text,
  visual_url text,
  video_url text,
  equipment text,
  created_at timestamptz not null default now()
);

create index exercises_muscle_group_idx on public.exercises (muscle_group);
create index exercises_name_idx on public.exercises using gin (to_tsvector('simple', name));

-- ============================================================================
-- routines + routine_exercises
-- ============================================================================

create table public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create index routines_user_idx on public.routines (user_id);

create table public.routine_exercises (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references public.routines (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete restrict,
  "order" smallint not null default 0,
  sets smallint,
  reps smallint,
  duration_seconds integer,
  rest_seconds integer default 60
);

create index routine_exercises_routine_idx on public.routine_exercises (routine_id, "order");

-- ============================================================================
-- workout_sessions + workout_session_logs
-- ============================================================================

create table public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  routine_id uuid references public.routines (id) on delete set null,
  date date not null default current_date,
  started_at timestamptz,
  completed_at timestamptz
);

create index workout_sessions_user_date_idx on public.workout_sessions (user_id, date desc);

create table public.workout_session_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.workout_sessions (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete restrict,
  sets_completed smallint,
  reps_completed smallint,
  weight_used numeric(6, 2)
);

create index workout_session_logs_session_idx on public.workout_session_logs (session_id);

-- ============================================================================
-- reminders
-- ============================================================================

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  label text not null,
  time time not null,
  days_of_week smallint[] not null default '{0,1,2,3,4,5,6}',
  linked_habit_type_id uuid references public.habit_types (id) on delete cascade,
  channel reminder_channel not null default 'push',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index reminders_user_idx on public.reminders (user_id) where active;

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.users enable row level security;
alter table public.weight_logs enable row level security;
alter table public.habit_types enable row level security;
alter table public.habit_logs enable row level security;
alter table public.sleep_logs enable row level security;
alter table public.meals enable row level security;
alter table public.exercises enable row level security;
alter table public.routines enable row level security;
alter table public.routine_exercises enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.workout_session_logs enable row level security;
alter table public.reminders enable row level security;

-- users: read/update own row only
create policy "users select own" on public.users for select using (auth.uid() = id);
create policy "users update own" on public.users for update using (auth.uid() = id);
create policy "users insert own" on public.users for insert with check (auth.uid() = id);

-- simple owner-column tables
create policy "weight_logs owner all" on public.weight_logs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "habit_types owner all" on public.habit_types for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "habit_logs owner all" on public.habit_logs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "sleep_logs owner all" on public.sleep_logs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "meals owner all" on public.meals for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "routines owner all" on public.routines for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "workout_sessions owner all" on public.workout_sessions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "reminders owner all" on public.reminders for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- exercises: public read-only catalog, writes reserved for the service role
-- (the wger import script uses the service role key, which bypasses RLS entirely)
create policy "exercises read all" on public.exercises for select
  using (auth.role() = 'authenticated' or auth.role() = 'anon');

-- routine_exercises: ownership via parent routine
create policy "routine_exercises owner all" on public.routine_exercises for all
  using (exists (select 1 from public.routines r where r.id = routine_id and r.user_id = auth.uid()))
  with check (exists (select 1 from public.routines r where r.id = routine_id and r.user_id = auth.uid()));

-- workout_session_logs: ownership via parent session
create policy "workout_session_logs owner all" on public.workout_session_logs for all
  using (exists (select 1 from public.workout_sessions s where s.id = session_id and s.user_id = auth.uid()))
  with check (exists (select 1 from public.workout_sessions s where s.id = session_id and s.user_id = auth.uid()));

-- ============================================================================
-- Storage bucket for meal photos
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('meal-photos', 'meal-photos', true)
on conflict (id) do nothing;

create policy "meal photos owner upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "meal photos owner manage" on storage.objects for update to authenticated
  using (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "meal photos owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "meal photos public read" on storage.objects for select
  using (bucket_id = 'meal-photos');
