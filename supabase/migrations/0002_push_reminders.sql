-- Web Push subscriptions + default meal-time reminders

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions owner all" on public.push_subscriptions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Seed the three meal-time reminders (Africa/Nairobi) whenever a new user is provisioned.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;

  insert into public.reminders (user_id, label, time, days_of_week, channel)
  values
    (new.id, 'Petit-déjeuner', '07:30', '{0,1,2,3,4,5,6}', 'push'),
    (new.id, 'Déjeuner', '13:00', '{0,1,2,3,4,5,6}', 'push'),
    (new.id, 'Dîner', '19:00', '{0,1,2,3,4,5,6}', 'push');

  return new;
end;
$$;
