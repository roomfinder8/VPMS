-- ===========================================================================
-- VPMS - 0006 : collapse the role model to just admin and user
--
--   admin = everything, including settings and user management
--   user  = day-to-day use: logs visitors, edits them, checks them out
--
-- The original 'secretary' and 'viewer' split was more separation than this
-- team needs. Existing rows in either of those roles become 'user'.
-- ===========================================================================

alter table public.profiles drop constraint profiles_role_check;

update public.profiles
   set role = 'user'
 where role in ('secretary', 'viewer');

alter table public.profiles
  add constraint profiles_role_check check (role in ('admin', 'user'));

comment on column public.profiles.role is
  'admin = full access including settings and user management / user = logs and edits visits';

-- Both roles may write; only the role names changed.
create or replace function private.can_edit()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select private.current_role_name() in ('admin', 'user');
$$;
