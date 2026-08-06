-- ===========================================================================
-- VPMS - 0005 : switch seed labels and column comments to English (ETTP Unit)
--
-- The earlier migrations were originally written with Thai labels and comments.
-- 0001-0004 in this folder have since been rewritten in English, so on a fresh
-- database this migration is a no-op; it exists to bring already-deployed
-- projects to the same state.
-- ===========================================================================

update public.validation_types set label = 'Free 2 hrs'   where id = 1;
update public.validation_types set label = 'Free 4 hrs'   where id = 2;
update public.validation_types set label = 'Free all day' where id = 3;

update public.validation_types
   set note = 'Default value - not yet confirmed with building management'
 where id in (1, 2);

update public.validation_types
   set note = 'Not yet confirmed whether the device actually has code 3'
 where id = 3;

comment on column public.profiles.role is
  'admin = system settings + user management / secretary = logs visitors / viewer = read-only (manager)';

comment on column public.validation_types.id is
  'The number pressed on the MeeSoft device, e.g. 1, 2, 3';
comment on column public.validation_types.free_hours is
  'null = free all day / unlimited hours';
comment on column public.validation_types.value_baht is
  'Approximate value, used for report totals - not the amount actually billed';
comment on column public.validation_types.is_confirmed is
  'true once the code, hours and value have been confirmed with building management';

comment on column public.visits.visit_date is
  'Derived: check-in date in Thailand time (UTC+7) - never write to it; this is the key for daily reports';
comment on column public.visits.visitor_count is
  'People arriving in this one car (a single stamp may cover several visitors)';

comment on column public.report_settings.send_time is
  'Thailand local time - a UTC cron schedule must subtract 7 hours';
comment on column public.report_settings.send_days is
  'ISO day of week 1=Mon..7=Sun; default is Mon-Fri';

comment on column public.report_runs.open_count is
  'Number of visits still without a check-out time at the moment the report was sent';
comment on column public.report_runs.triggered_by is
  'null = sent automatically by the scheduled job';

comment on view public.visits_report is
  'Visits with Thailand-local times ready to use - the single source for Excel export and report emails';
