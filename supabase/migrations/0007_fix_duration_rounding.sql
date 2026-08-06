-- ===========================================================================
-- VPMS - 0007 : the duration must agree with the times shown next to it
--
-- `::integer` in Postgres rounds half-up, so a visit from 11:38:00 to 11:40:55
-- (2m55s) came out as 3 minutes while the row displayed "11:38 → 11:40".
-- A report where time_out minus time_in does not equal the duration column is
-- exactly the kind of detail that gets the whole report questioned.
--
-- check_in_at is always stored on an exact minute (the form builds it from
-- HH:mm) while check_out_at carries seconds from now(), so flooring makes the
-- duration match the difference between the two displayed clock times exactly.
--
-- The view has to be dropped and recreated because it depends on the column.
-- ===========================================================================

drop view public.visits_report;

alter table public.visits drop column duration_minutes;

alter table public.visits
  add column duration_minutes integer generated always as (
    case
      when check_out_at is null then null
      else floor(extract(epoch from (check_out_at - check_in_at)) / 60)::integer
    end
  ) stored;

comment on column public.visits.duration_minutes is
  'Whole minutes, floored so it always matches the difference between the displayed check-in and check-out times';

create view public.visits_report
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
