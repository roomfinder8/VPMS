-- ===========================================================================
-- VPMS - 0008 : a custom slot where the hours are typed per visit
--
-- The three seeded codes match keys on the MeeSoft device. A fourth option is
-- needed for anything that does not: a one-off arrangement, or a code the
-- building adds later that nobody has told us about yet.
--
-- Modelled as a validation_type flagged is_custom, with the hours living on the
-- visit rather than on the type, so every visit can carry a different number.
-- id 99 sits deliberately outside the device-key range - it is not a key anyone
-- presses.
-- ===========================================================================

alter table public.validation_types
  add column is_custom boolean not null default false;

comment on column public.validation_types.is_custom is
  'true = hours are entered per visit in visits.custom_free_hours; id is not a device key';

insert into public.validation_types (id, label, free_hours, color, sort_order, is_confirmed, is_custom, note)
values (99, 'Custom', null, 'emerald', 90, true, true,
        'Hours are typed in on each visit - use for one-off arrangements or a new code')
on conflict (id) do nothing;

alter table public.visits
  add column custom_free_hours numeric(4, 1)
    constraint visits_custom_free_hours_positive
      check (custom_free_hours is null or (custom_free_hours > 0 and custom_free_hours <= 24));

comment on column public.visits.custom_free_hours is
  'Free hours for this visit when the chosen validation type is_custom; null otherwise';

-- The view now reports effective hours and a readable label for custom rows.
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
  case when vt.is_custom then null else vt.id end                           as validation_code,
  case
    when vt.is_custom and v.custom_free_hours is not null
      then 'Custom ' || trim(trailing '.' from trim(trailing '0' from v.custom_free_hours::text)) || ' hrs'
    else vt.label
  end                                                                       as validation_label,
  coalesce(v.custom_free_hours, vt.free_hours)                              as free_hours,
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
