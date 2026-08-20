-- ===========================================================================
-- VPMS - 0013 : vehicle brand + per-visit approval
--
-- Vehicle brand (Toyota, Ford, Benz...) is an open set - there is no fixed
-- list to pick from, so it is a free-text column with app-side autocomplete,
-- the same pattern as company_name. It lives next to license_plate because
-- the two exist to identify one physical car, not to categorise it.
--
-- Approval is per visit, not per day: the head sometimes approves visits one
-- at a time rather than the whole day together. approver_name is free text
-- (autocomplete, same as vehicle_brand) because it can change at short notice
-- and there is no fixed roster to maintain. Status is derived from the two
-- columns, not stored separately:
--   no approver_name              -> "no approver"
--   approver_name, no approved_on -> "awaiting"
--   both set                      -> "approved"
-- ===========================================================================

alter table public.visits
  add column vehicle_brand  text,
  add column approver_name  text,
  add column approved_on    date;

comment on column public.visits.vehicle_brand is
  'Free text (Toyota, Ford, Benz...) - open set, no fixed list, same autocomplete pattern as company_name';
comment on column public.visits.approver_name is
  'Free text, not a foreign key - the approving head can change at short notice with no roster to maintain first';
comment on column public.visits.approved_on is
  'Set once the head confirms by email; null means still awaiting (if approver_name is set) or not yet assigned';

alter table public.visits
  add constraint visits_approved_after_visit
    check (approved_on is null or approved_on >= visit_date);

alter table public.visits
  add constraint visits_approver_required_when_approved
    check (approved_on is null or approver_name is not null);

-- visits_report picks up the new columns and a derived approval_status, so
-- Excel/email never have to recompute the same three-way logic themselves.
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
  v.vehicle_brand,
  v.remark,
  case
    when v.check_out_at is null and v.auto_closed then 'no_checkout'
    when v.check_out_at is null                   then 'in'
    when v.auto_closed                            then 'estimated'
    else 'out'
  end                                                                       as status,
  v.auto_closed,
  v.approver_name,
  v.approved_on,
  case
    when v.approver_name is null   then 'no_approver'
    when v.approved_on   is null   then 'awaiting'
    else 'approved'
  end                                                                       as approval_status,
  p.full_name                                                               as created_by_name,
  v.check_in_at,
  v.check_out_at,
  v.created_at
from public.visits v
join public.validation_types vt on vt.id = v.validation_type_id
left join public.profiles p     on p.id = v.created_by;
