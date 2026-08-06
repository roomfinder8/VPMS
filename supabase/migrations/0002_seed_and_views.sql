-- ===========================================================================
-- VPMS - 0002_seed_and_views.sql
-- Seed data + the reporting view
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Validation types
--
-- WARNING: the codes, hours and values below are unconfirmed defaults
--   (is_confirmed = false). Check with the secretary / building management which
--   numbers the MeeSoft device actually accepts, then correct them in the app
--   under Settings -> Validation types. There is no need to edit this file.
--   The app shows a "not confirmed" banner until someone ticks the confirmation.
-- ---------------------------------------------------------------------------
insert into public.validation_types (id, label, free_hours, value_baht, color, sort_order, is_confirmed, note)
values
  (1, 'Free 2 hrs',   2,    null, 'sky',    10, false, 'Default value - not yet confirmed with building management'),
  (2, 'Free 4 hrs',   4,    null, 'violet', 20, false, 'Default value - not yet confirmed with building management'),
  (3, 'Free all day', null, null, 'amber',  30, false, 'Not yet confirmed whether the device actually has code 3')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- visits_report - the one place UTC is converted to Thailand time for reporting.
-- Everything that exports or emails data should read from this view and must not
-- convert time zones a second time.
-- security_invoker keeps the querying user's RLS in force.
-- ---------------------------------------------------------------------------
create or replace view public.visits_report
with (security_invoker = true) as
select
  v.id,
  v.visit_date,
  to_char(v.check_in_at  at time zone 'Asia/Bangkok', 'HH24:MI')            as time_in,
  to_char(v.check_out_at at time zone 'Asia/Bangkok', 'HH24:MI')            as time_out,
  v.duration_minutes,
  case
    when v.duration_minutes is null then null
    else (v.duration_minutes / 60) || ':' || lpad((v.duration_minutes % 60)::text, 2, '0')
  end                                                                       as duration_hhmm,
  v.visitor_name,
  v.visitor_count,
  v.company_name,
  v.host_name,
  v.purpose,
  vt.id                                                                     as validation_code,
  vt.label                                                                  as validation_label,
  vt.free_hours,
  vt.value_baht,
  v.parking_card_no,
  v.license_plate,
  v.remark,
  case
    when v.check_out_at is null then 'in'
    when v.auto_closed            then 'no_checkout'
    else 'out'
  end                                                                       as status,
  v.auto_closed,
  p.full_name                                                               as created_by_name,
  v.check_in_at,
  v.check_out_at,
  v.created_at
from public.visits v
join public.validation_types vt on vt.id = v.validation_type_id
left join public.profiles p     on p.id = v.created_by;

comment on view public.visits_report is
  'Visits with Thailand-local times ready to use - the single source for Excel export and report emails';
