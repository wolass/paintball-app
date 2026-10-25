-- Keep recurring practices filled 12 weeks ahead by extending them every night.
-- Uses pg_cron, which Supabase provides. Skipped where it isn't installed (e.g. local tests).
do $outer$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('extend-event-series', '15 3 * * *', 'select public.extend_all_series()');
  end if;
end $outer$;
