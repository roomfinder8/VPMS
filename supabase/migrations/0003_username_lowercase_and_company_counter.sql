-- ===========================================================================
-- VPMS - 0003
-- ===========================================================================

-- 1) Force usernames to lowercase. The login page lowercases whatever is typed
--    before looking it up, so a stored 'Nan' would never be found and the cause
--    would be hard to spot. Enforce it at the database level instead.
alter table public.profiles
  add constraint profiles_username_lowercase check (username = lower(username));

-- 2) Count how often each company visits, used to rank the autocomplete list.
--    Done as a trigger rather than in application code so the count cannot drift
--    when records are edited or deleted.
create or replace function public.sync_company_visit_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.company_id is not null then
      update public.companies set visit_count = visit_count + 1 where id = new.company_id;
    end if;

  elsif tg_op = 'DELETE' then
    if old.company_id is not null then
      update public.companies set visit_count = greatest(visit_count - 1, 0) where id = old.company_id;
    end if;

  elsif new.company_id is distinct from old.company_id then
    if old.company_id is not null then
      update public.companies set visit_count = greatest(visit_count - 1, 0) where id = old.company_id;
    end if;
    if new.company_id is not null then
      update public.companies set visit_count = visit_count + 1 where id = new.company_id;
    end if;
  end if;

  return null;
end;
$$;

create trigger visits_sync_company_count
  after insert or update of company_id or delete on public.visits
  for each row execute function public.sync_company_visit_count();
