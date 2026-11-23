-- Typewriter Journal: Supabase schema.
-- Applied automatically by the Supabase GitHub integration (or paste into SQL Editor and Run).
-- Safe to run more than once.
--
-- One row per signed-in user holds that user's whole journal (projects, notes, settings) as JSON.
-- Row-level security makes every row visible and writable only by its owner.

create table if not exists public.journal_state (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  rev        integer     not null default 0,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.journal_state enable row level security;

drop policy if exists "read own journal" on public.journal_state;
create policy "read own journal" on public.journal_state
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "insert own journal" on public.journal_state;
create policy "insert own journal" on public.journal_state
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "update own journal" on public.journal_state;
create policy "update own journal" on public.journal_state
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Save with an optimistic lock: the write only succeeds if the caller saw the latest revision.
-- A stale write (for example from a second tab or device) raises 'stale' and the page reloads.
create or replace function public.save_journal(base_rev integer, payload jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  cur integer;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  select rev into cur from journal_state where user_id = auth.uid() for update;

  if cur is null then
    if base_rev <> 0 then
      raise exception 'stale';
    end if;
    insert into journal_state (user_id, rev, data) values (auth.uid(), 1, payload);
    return 1;
  end if;

  if cur <> base_rev then
    raise exception 'stale';
  end if;

  update journal_state set rev = cur + 1, data = payload, updated_at = now() where user_id = auth.uid();
  return cur + 1;
end;
$$;

revoke all on function public.save_journal(integer, jsonb) from public, anon;
grant execute on function public.save_journal(integer, jsonb) to authenticated;
