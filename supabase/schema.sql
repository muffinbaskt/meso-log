-- Meso Log database. Run once in Supabase: SQL Editor > New query > paste > Run.
-- One row of settings/library per user, plus one row per mesocycle.
-- Row level security limits every row to the signed-in user who owns it.

create table if not exists public.user_core (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.mesos (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.user_core enable row level security;
alter table public.mesos enable row level security;

drop policy if exists "own core" on public.user_core;
create policy "own core" on public.user_core for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own mesos" on public.mesos;
create policy "own mesos" on public.mesos for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.user_core, public.mesos from anon;
grant select, insert, update, delete on public.user_core, public.mesos to authenticated;

-- Lets a signed-in user delete their own account. Their rows go with it (on delete cascade).
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from auth.users where id = auth.uid();
end $$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- Size limits (added 2026-10-30). Sign-up is open, so cap what one account can store.
-- Real data is far smaller: a whole account's settings and library is well under 1 MB, a mesocycle about 100 KB.
alter table public.user_core drop constraint if exists core_size;
alter table public.user_core add constraint core_size check (pg_column_size(data) < 2000000);
alter table public.mesos drop constraint if exists meso_size;
alter table public.mesos add constraint meso_size check (pg_column_size(data) < 2000000 and length(id) <= 64);
