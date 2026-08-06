-- ===========================================================================
-- VPMS - Visitor Parking Validation Management System (ETTP Unit)
-- 0001_init.sql : schema, RLS, triggers
--
-- Apply with `supabase db push`, or paste into the SQL editor of the VPMS
-- project (NOT the RoomFinder project - VPMS has its own Supabase project).
--
-- ---------------------------------------------------------------------------
-- TIMEZONE POLICY - read this before touching anything time related
-- ---------------------------------------------------------------------------
--   * every timestamp is timestamptz, which Postgres always stores as UTC
--   * "the date of a visit" (visit_date) is the date in Thailand time, not UTC.
--     Using the UTC date would push anything before 07:00 Thailand time onto
--     the previous day's report.
--   * generated columns only accept IMMUTABLE expressions:
--       `at time zone 'Asia/Bangkok'` (a zone *name*) is STABLE  -> not allowed
--       `at time zone interval '+07:00'`                is IMMUTABLE -> allowed
--     Thailand is a fixed UTC+7 with no DST and never has been, so hardcoding
--     +07:00 is safe here. Views have no such restriction and use the zone name.
--   * the app must never rely on the device's own time zone; always format with
--     Intl.DateTimeFormat(..., { timeZone: 'Asia/Bangkok' }) so a phone set to
--     the wrong zone, or a laptop taken abroad, still shows the same clock time.
-- ===========================================================================

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- helper: updated_at
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles - mirrors auth.users
-- Same shape as RoomFinder so the existing login flow can be reused:
--   type a username -> select email from profiles where username = ? -> signInWithPassword
-- There is no public signup: accounts are created by an admin via the service-role key.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  username   text not null unique,
  email      text not null unique,
  full_name  text not null,
  role       text not null check (role in ('admin', 'secretary', 'viewer')),
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.profiles.role is
  'admin = system settings + user management / secretary = logs visitors / viewer = read-only (manager)';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- validation_types - the codes pressed on the MeeSoft device
-- id is the number actually pressed. Editable from the settings page so a new
-- code does not require a migration.
-- Nothing here is confirmed with building management yet -> is_confirmed = false.
-- ---------------------------------------------------------------------------
create table public.validation_types (
  id           smallint primary key check (id between 0 and 99),
  label        text not null,
  free_hours   numeric(4, 1),
  value_baht   numeric(8, 2),
  color        text not null default 'slate',
  sort_order   smallint not null default 0,
  is_active    boolean not null default true,
  is_confirmed boolean not null default false,
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on column public.validation_types.id is
  'The number pressed on the MeeSoft device, e.g. 1, 2, 3';
comment on column public.validation_types.free_hours is
  'null = free all day / unlimited hours';
comment on column public.validation_types.value_baht is
  'Approximate value, used for report totals - not the amount actually billed';
comment on column public.validation_types.is_confirmed is
  'true once the code, hours and value have been confirmed with building management';

create trigger validation_types_set_updated_at
  before update on public.validation_types
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- companies / hosts - lookup data for autocomplete
-- companies are created on the fly when a new name is typed (get-or-create).
-- hosts are the ETTP staff being visited, managed from the settings page.
-- ---------------------------------------------------------------------------
create table public.companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  name_key    text generated always as (lower(btrim(name))) stored unique,
  visit_count integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index companies_name_trgm_idx on public.companies using gin (name gin_trgm_ops);

create trigger companies_set_updated_at
  before update on public.companies
  for each row execute function public.set_updated_at();

create table public.hosts (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  name_key   text generated always as (lower(btrim(name))) stored unique,
  department text,
  is_active  boolean not null default true,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index hosts_name_trgm_idx on public.hosts using gin (name gin_trgm_ops);

create trigger hosts_set_updated_at
  before update on public.hosts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- visits - the main table
-- company_name / host_name keep a snapshot alongside the foreign keys, so
-- renaming a company later does not rewrite history in reports already sent.
-- ---------------------------------------------------------------------------
create table public.visits (
  id            uuid primary key default gen_random_uuid(),

  check_in_at   timestamptz not null default now(),
  check_out_at  timestamptz,

  -- Thailand-local date; the axis every daily report is built on (see policy above)
  visit_date    date generated always as
                  (((check_in_at at time zone interval '+07:00'))::date) stored,

  duration_minutes integer generated always as (
    case
      when check_out_at is null then null
      else (extract(epoch from (check_out_at - check_in_at)) / 60)::integer
    end
  ) stored,

  visitor_name  text not null,
  visitor_count smallint not null default 1 check (visitor_count between 1 and 50),

  company_id    uuid references public.companies (id) on delete set null,
  company_name  text not null,

  host_id       uuid references public.hosts (id) on delete set null,
  host_name     text not null,

  purpose       text,

  validation_type_id smallint not null references public.validation_types (id),

  parking_card_no text,
  license_plate   text,
  remark          text,

  -- true = closed by the end-of-day job rather than by someone pressing the
  -- button, which the report flags rather than hiding
  auto_closed   boolean not null default false,

  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint visits_checkout_after_checkin
    check (check_out_at is null or check_out_at >= check_in_at)
);

comment on column public.visits.visit_date is
  'Derived: check-in date in Thailand time (UTC+7) - never write to it; this is the key for daily reports';
comment on column public.visits.visitor_count is
  'People arriving in this one car (a single stamp may cover several visitors)';

create index visits_visit_date_idx      on public.visits (visit_date desc);
create index visits_open_idx            on public.visits (visit_date) where check_out_at is null;
create index visits_company_idx         on public.visits (company_id);
create index visits_host_idx            on public.visits (host_id);
create index visits_validation_type_idx on public.visits (validation_type_id);
create index visits_search_trgm_idx     on public.visits using gin (
  (visitor_name || ' ' || company_name || ' ' || host_name) gin_trgm_ops
);

create trigger visits_set_updated_at
  before update on public.visits
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- report_settings - single-row config
-- draft = sent to the secretary to review; final = what she forwards to the manager
-- ---------------------------------------------------------------------------
create table public.report_settings (
  id                boolean primary key default true
                      constraint single_row check (id = true),

  draft_recipients  text[] not null default '{}',   -- the secretary (reviewer)
  final_recipients  text[] not null default '{}',   -- the manager
  final_cc          text[] not null default '{}',

  send_time         time not null default '17:30',  -- Thailand local time
  send_days         smallint[] not null default '{1,2,3,4,5}',  -- ISO: 1=Mon .. 7=Sun
  report_timezone   text not null default 'Asia/Bangkok',

  auto_send_enabled      boolean not null default true,
  auto_close_open_visits boolean not null default true,

  updated_at        timestamptz not null default now()
);

comment on column public.report_settings.send_time is
  'Thailand local time - a UTC cron schedule must subtract 7 hours';
comment on column public.report_settings.send_days is
  'ISO day of week 1=Mon..7=Sun; default is Mon-Fri';

insert into public.report_settings (id) values (true);

create trigger report_settings_set_updated_at
  before update on public.report_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- report_runs - a log of every send, so "was today's report sent?" has an answer
-- ---------------------------------------------------------------------------
create table public.report_runs (
  id           uuid primary key default gen_random_uuid(),
  report_date  date not null,
  kind         text not null check (kind in ('draft', 'final')),
  status       text not null check (status in ('sent', 'failed', 'skipped')),
  recipients   text[] not null default '{}',
  visit_count  integer,
  open_count   integer,
  error        text,
  triggered_by uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);

comment on column public.report_runs.open_count is
  'Number of visits still without a check-out time at the moment the report was sent';
comment on column public.report_runs.triggered_by is
  'null = sent automatically by the scheduled job';

create index report_runs_lookup_idx on public.report_runs (report_date desc, kind, created_at desc);

-- ===========================================================================
-- RLS
-- The cron / report jobs use the service-role key, which bypasses all of this.
-- ===========================================================================
alter table public.profiles         enable row level security;
alter table public.validation_types enable row level security;
alter table public.companies        enable row level security;
alter table public.hosts            enable row level security;
alter table public.visits           enable row level security;
alter table public.report_settings  enable row level security;
alter table public.report_runs      enable row level security;

-- security definer with a fixed search_path, so the policy does not recurse into
-- the RLS of profiles itself
create or replace function public.current_role_name()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and is_active;
$$;

create or replace function public.can_edit()
returns boolean
language sql
stable
as $$
  select public.current_role_name() in ('admin', 'secretary');
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select public.current_role_name() = 'admin';
$$;

-- profiles ------------------------------------------------------------------
-- anyone signed in can read (to render "created by"); only admins can write
create policy profiles_select on public.profiles
  for select using (auth.uid() is not null);
create policy profiles_admin_write on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- Note: the login page has to resolve a username to an email before a session
-- exists, which the policy above deliberately blocks. That lookup runs on the
-- server with the secret key instead. The profiles table is never readable by
-- anon, so staff email addresses cannot be scraped.

-- reference data ------------------------------------------------------------
create policy validation_types_read on public.validation_types
  for select using (auth.uid() is not null);
create policy validation_types_admin_write on public.validation_types
  for all using (public.is_admin()) with check (public.is_admin());

create policy companies_read on public.companies
  for select using (auth.uid() is not null);
create policy companies_write on public.companies
  for all using (public.can_edit()) with check (public.can_edit());

create policy hosts_read on public.hosts
  for select using (auth.uid() is not null);
create policy hosts_write on public.hosts
  for all using (public.can_edit()) with check (public.can_edit());

-- visits --------------------------------------------------------------------
create policy visits_read on public.visits
  for select using (auth.uid() is not null);
create policy visits_write on public.visits
  for all using (public.can_edit()) with check (public.can_edit());

-- settings / logs -----------------------------------------------------------
create policy report_settings_read on public.report_settings
  for select using (auth.uid() is not null);
create policy report_settings_admin_write on public.report_settings
  for all using (public.is_admin()) with check (public.is_admin());

create policy report_runs_read on public.report_runs
  for select using (auth.uid() is not null);
create policy report_runs_write on public.report_runs
  for insert with check (public.can_edit());
