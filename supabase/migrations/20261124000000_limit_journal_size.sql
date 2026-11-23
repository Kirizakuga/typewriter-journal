-- Cap one journal save at 5 MB so a signed-in account cannot bloat the database.
-- Same check as before otherwise. Safe to run more than once.

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

  if jsonb_typeof(payload) <> 'object' then
    raise exception 'payload must be an object';
  end if;

  if octet_length(payload::text) > 5 * 1024 * 1024 then
    raise exception 'too large';
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

-- The same cap for direct table writes (owners can still update their own row through the API).
alter table public.journal_state drop constraint if exists journal_state_data_size;
alter table public.journal_state add constraint journal_state_data_size
  check (octet_length(data::text) <= 5 * 1024 * 1024);
