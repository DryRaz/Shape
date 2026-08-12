-- AI-generated training programs: 1 program = N linked routines (weeks × sessions).

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  goal_type goal_type,
  name text not null,
  created_at timestamptz not null default now()
);

create index programs_user_idx on public.programs (user_id, created_at desc);

alter table public.routines
  add column program_id uuid references public.programs (id) on delete cascade,
  add column week_number smallint,
  add column session_number smallint;

create index routines_program_idx on public.routines (program_id, week_number, session_number);

alter table public.programs enable row level security;

create policy "programs owner all" on public.programs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
