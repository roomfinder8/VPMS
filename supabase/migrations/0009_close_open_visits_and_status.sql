-- ===========================================================================
-- VPMS - 0009 : end-of-day handling for visits nobody checked out
--
-- Rule: the exit time becomes check-in + the free hours that were stamped.
-- That is a defensible estimate rather than an arbitrary cutoff, but it is
-- still an estimate, so auto_closed stays true and the report labels those
-- rows "estimated". Anyone reading the report can tell a derived time from a
-- recorded one.
--
-- "Free all day" carries no hour count, so nothing can be derived: the exit
-- stays empty and the row is flagged as having no check-out at all.
-- ===========================================================================

comment on column public.visits.auto_closed is
  'true = the end-of-day job touched this row; the exit time is derived (or absent), not one somebody recorded';

create or replace function private.close_open_visits(p_date date)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  affected integer;
begin
  update public.visits v
     set check_out_at = case
           when coalesce(v.custom_free_hours, vt.free_hours) is not null
             then v.check_in_at
                  + (coalesce(v.custom_free_hours, vt.free_hours)::double precision
                     * interval '1 hour')
           else null
         end,
         auto_closed  = true
    from public.validation_types vt
   where vt.id = v.validation_type_id
     and v.visit_date     = p_date
     and v.check_out_at  is null
     and v.auto_closed    = false;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

comment on function private.close_open_visits(date) is
  'Closes visits left open on the given Thailand-local date; returns how many rows were touched';

-- Four states now, because "no exit recorded" and "exit estimated" are
-- different things and the report has to be able to say which.
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
    when v.check_out_at is null and v.auto_closed then 'no_checkout'
    when v.check_out_at is null                   then 'in'
    when v.auto_closed                            then 'estimated'
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
