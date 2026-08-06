-- ===========================================================================
-- VPMS - 0010 : expose close_open_visits to the scheduled job only
--
-- PostgREST only publishes functions in the exposed schemas, so the real
-- implementation in `private` cannot be reached over the API. The job needs to
-- call it, so this wrapper lives in public - but every role except service_role
-- has EXECUTE revoked, which keeps it off the API surface for signed-in users
-- and anonymous callers alike.
-- ===========================================================================

create or replace function public.close_open_visits(p_date date)
returns integer
language sql
security definer
set search_path = public, pg_temp
as $$
  select private.close_open_visits(p_date);
$$;

comment on function public.close_open_visits(date) is
  'Service-role only wrapper around private.close_open_visits, for the scheduled report job';

revoke all on function public.close_open_visits(date) from public, anon, authenticated;
grant execute on function public.close_open_visits(date) to service_role;
