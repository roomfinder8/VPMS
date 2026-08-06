-- ===========================================================================
-- VPMS - 0004 : close everything the Supabase security advisor flagged
--
-- Problem: any function living in the public schema is automatically published
--          by PostgREST as an RPC endpoint (/rest/v1/rpc/<name>), including
--          internal helpers and trigger functions nobody should be able to call.
-- Fix:     move them into a `private` schema, which is not exposed through the
--          API, and pin search_path so it cannot be hijacked.
-- ===========================================================================

create schema if not exists private;
-- RLS policies are evaluated with the querying user's privileges, so that role
-- still needs to be able to reach the helpers.
grant usage on schema private to authenticated, service_role;

-- 1) trigger functions - move wholesale (triggers reference them by OID, so
--    nothing breaks)
alter function public.set_updated_at() set schema private;
alter function private.set_updated_at() set search_path = pg_catalog, pg_temp;

alter function public.sync_company_visit_count() set schema private;
alter function private.sync_company_visit_count() set search_path = public, pg_temp;

-- 2) RLS helpers - recreated in private
create or replace function private.current_role_name()
returns text
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select role from public.profiles where id = auth.uid() and is_active;
$$;

create or replace function private.can_edit()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select private.current_role_name() in ('admin', 'secretary');
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select private.current_role_name() = 'admin';
$$;

grant execute on function private.current_role_name(), private.can_edit(), private.is_admin()
  to authenticated;

-- 3) point the policies at the new functions
drop policy profiles_admin_write         on public.profiles;
drop policy validation_types_admin_write on public.validation_types;
drop policy companies_write              on public.companies;
drop policy hosts_write                  on public.hosts;
drop policy visits_write                 on public.visits;
drop policy report_settings_admin_write  on public.report_settings;
drop policy report_runs_write            on public.report_runs;

create policy profiles_admin_write on public.profiles
  for all using (private.is_admin()) with check (private.is_admin());

create policy validation_types_admin_write on public.validation_types
  for all using (private.is_admin()) with check (private.is_admin());

create policy companies_write on public.companies
  for all using (private.can_edit()) with check (private.can_edit());

create policy hosts_write on public.hosts
  for all using (private.can_edit()) with check (private.can_edit());

create policy visits_write on public.visits
  for all using (private.can_edit()) with check (private.can_edit());

create policy report_settings_admin_write on public.report_settings
  for all using (private.is_admin()) with check (private.is_admin());

create policy report_runs_write on public.report_runs
  for insert with check (private.can_edit());

-- 4) clean up the old public versions
drop function public.can_edit();
drop function public.is_admin();
drop function public.current_role_name();

-- 5) move pg_trgm out of public, per Supabase's own guidance.
--    Existing indexes reference the operator class by OID and keep working, but
--    any new DDL must spell it extensions.gin_trgm_ops.
alter extension pg_trgm set schema extensions;
