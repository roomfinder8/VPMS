-- ===========================================================================
-- VPMS - 0011 : the schedule that triggers the daily report
--
-- pg_cron rather than Vercel Cron: on Vercel's Hobby plan a cron entry runs
-- once a day and can drift by up to about an hour, which is no good for
-- something that has to land on the reviewer's desk at the end of the working
-- day. pg_cron fires on time.
--
-- The job runs every 15 minutes and the endpoint decides whether today's report
-- is actually due. That keeps the send time in report_settings, changeable from
-- the Settings page without touching this schedule, and means a run missed
-- while the app was down still goes out on the next tick.
--
-- Nothing is scheduled by this migration: it only installs the helper. Call it
-- once, after the app has a public URL:
--
--   select private.schedule_daily_report('https://your-app.vercel.app', '<CRON_SECRET>');
--
-- and to stop it again:
--
--   select private.unschedule_daily_report();
-- ===========================================================================

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net  with schema extensions;

create or replace function private.schedule_daily_report(
  p_app_url     text,
  p_cron_secret text
)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_catalog, pg_temp
as $$
declare
  job_name constant text := 'vpms-daily-report';
  endpoint text := rtrim(p_app_url, '/') || '/api/cron/daily-report';
begin
  if p_app_url is null or p_app_url = '' then
    raise exception 'app url is required';
  end if;
  if p_cron_secret is null or p_cron_secret = '' then
    raise exception 'cron secret is required';
  end if;

  if exists (select 1 from cron.job where jobname = job_name) then
    perform cron.unschedule(job_name);
  end if;

  perform cron.schedule(
    job_name,
    '*/15 * * * *',
    format(
      $cmd$select net.http_post(
        url     := %L,
        headers := jsonb_build_object(
                     'Authorization', %L,
                     'Content-Type',  'application/json'
                   ),
        body    := '{}'::jsonb
      );$cmd$,
      endpoint,
      'Bearer ' || p_cron_secret
    )
  );

  return format('scheduled %s every 15 minutes -> %s', job_name, endpoint);
end;
$$;

comment on function private.schedule_daily_report(text, text) is
  'Creates or replaces the pg_cron job that pokes the daily report endpoint; run once after deploying';

create or replace function private.unschedule_daily_report()
returns text
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
begin
  if exists (select 1 from cron.job where jobname = 'vpms-daily-report') then
    perform cron.unschedule('vpms-daily-report');
    return 'unscheduled';
  end if;
  return 'nothing scheduled';
end;
$$;
