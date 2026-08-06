-- ===========================================================================
-- VPMS - 0012 : the report goes to the reviewer and stops there
--
-- The system sends one email, to the secretary. She checks the numbers, adjusts
-- whatever needs adjusting, and writes her own message to the manager from her
-- own mailbox. A report arriving at the manager straight out of a personal
-- Gmail account was never going to look right anyway.
--
-- So there is no "final" send, and no manager address to store.
-- ===========================================================================

alter table public.report_settings drop column final_recipients;
alter table public.report_settings drop column final_cc;

comment on column public.report_settings.draft_recipients is
  'Who receives the daily report - the person who reviews it, not the manager';

comment on column public.report_runs.kind is
  'Always ''draft'' now: the only email the system sends is the one to the reviewer';
