-- Run against a fresh database after supabase_stub.sql and the migrations.
-- Every check raises an exception on failure; the script ends with "ALL PASSED".

\set ON_ERROR_STOP 1
\o /dev/null

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'anna@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'ben@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'outsider@example.com');

create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAILED: %', what; end if;
end $$;

create function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p::text, ''), false);
end $$;

-- Profiles are created on sign-up
select pg_temp.check((select count(*) = 3 from profiles), 'profiles created for new users');
select pg_temp.check((select display_name = 'anna' from profiles where id = '00000000-0000-0000-0000-00000000000a'), 'display name from email');

-- Anna creates a team and becomes its owner
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into teams (name, timezone) values ('Hitmen', 'Europe/Berlin');
select pg_temp.check((select role = 'owner' from team_members where user_id = auth.uid()), 'creator is owner');

-- Ben joins with the invite code
reset role;
select set_config('test.code', (select invite_code from teams limit 1), false);
select set_config('test.team', (select id::text from teams limit 1), false);
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select join_team(lower(current_setting('test.code')));
select pg_temp.check((select count(*) = 2 from team_members), 'ben sees two members');
select pg_temp.check((select count(*) = 2 from profiles), 'ben sees anna''s profile and his own');

-- Players cannot create events or change roles
do $$ begin
  insert into events (team_id, title, starts_at) values (current_setting('test.team')::uuid, 'x', now() + interval '1 day');
  raise exception 'FAILED: player created an event';
exception when insufficient_privilege then null;
end $$;
update team_members set role = 'owner' where user_id = auth.uid();
select pg_temp.check((select role = 'player' from team_members where user_id = auth.uid()), 'player cannot promote himself');

-- Anna creates a weekly Sunday practice; events and attendance rows appear
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into event_series (team_id, title, weekdays, start_time, starts_on, duration_minutes)
values (current_setting('test.team')::uuid, 'Sunday practice', '{7}', '10:00', current_date, 180);
select pg_temp.check((select count(*) between 12 and 13 from events), 'about 12 weekly events generated');
select pg_temp.check((select bool_and(extract(isodow from starts_at at time zone 'Europe/Berlin') = 7
                                      and (starts_at at time zone 'Europe/Berlin')::time = '10:00') from events),
                     'events are Sundays 10:00 Berlin time');
select pg_temp.check((select count(*) = 2 * (select count(*) from events) from attendance where status = 'pending'),
                     'pending attendance for both members');

-- Every two weeks on Tuesday and Thursday
insert into event_series (team_id, title, weekdays, interval_weeks, start_time, starts_on)
values (current_setting('test.team')::uuid, 'Fitness', '{2,4}', 2, '19:00', current_date);
select pg_temp.check((select count(*) between 11 and 14 from events where title = 'Fitness'), 'biweekly Tue/Thu events');
delete from event_series where title = 'Fitness';
select pg_temp.check((select count(*) = 0 from events where title = 'Fitness'), 'deleting a series removes its events');

-- Ben answers for himself but not for Anna
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select set_config('test.event', (select id::text from events order by starts_at limit 1), false);
update attendance set status = 'going', comment = 'bringing paint' where event_id = current_setting('test.event')::uuid and user_id = auth.uid();
select pg_temp.check((select status = 'going' and responded_at is not null from attendance
                      where event_id = current_setting('test.event')::uuid and user_id = auth.uid()), 'ben answered');
update attendance set status = 'going' where user_id = '00000000-0000-0000-0000-00000000000a';
select pg_temp.check((select bool_and(status = 'pending') from attendance where user_id = '00000000-0000-0000-0000-00000000000a'),
                     'ben cannot answer for anna');
do $$ begin
  update attendance set user_id = '00000000-0000-0000-0000-00000000000a' where user_id = auth.uid();
  raise exception 'FAILED: player moved his row';
exception when insufficient_privilege then null;
end $$;

-- Ben goes on holiday for the next 10 days
insert into absences (starts_on, ends_on, reason) values (current_date, current_date + 9, 'holiday');
select pg_temp.check((select bool_and(status = 'not_going' and absence_id is not null) from attendance a join events e on e.id = a.event_id
                      where a.user_id = auth.uid() and (e.starts_at at time zone 'Europe/Berlin')::date <= current_date + 9),
                     'absence answers not going');
select pg_temp.check((select bool_and(status = 'pending') from attendance a join events e on e.id = a.event_id
                      where a.user_id = auth.uid() and (e.starts_at at time zone 'Europe/Berlin')::date > current_date + 9),
                     'events after the absence are untouched');
-- Shorter holiday: the second week reopens
update absences set ends_on = current_date where user_id = auth.uid();
select pg_temp.check((select count(*) = 0 from attendance a join events e on e.id = a.event_id
                      where a.user_id = auth.uid() and a.status = 'not_going' and (e.starts_at at time zone 'Europe/Berlin')::date > current_date),
                     'shortened absence releases later events');
delete from absences where user_id = auth.uid();
select pg_temp.check((select count(*) = 0 from attendance where user_id = auth.uid() and absence_id is not null), 'deleted absence releases events');

-- New events respect existing absences
insert into absences (starts_on, ends_on, reason) values (current_date + 30, current_date + 30, 'work');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into events (team_id, title, kind, starts_at, players_per_side, league)
values (current_setting('test.team')::uuid, 'ICS Flatow', 'tournament', ((current_date + 30) + time '09:00') at time zone 'Europe/Berlin', 5, 'ICS');
select pg_temp.check((select status = 'not_going' from attendance a join events e on e.id = a.event_id
                      where e.title = 'ICS Flatow' and a.user_id = '00000000-0000-0000-0000-00000000000b'), 'new event respects absence');

-- Answers lock: players cannot change, staff can
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
update attendance set status = 'going' where event_id = current_setting('test.event')::uuid and user_id = auth.uid();
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
update events set rsvp_locks_at = now() - interval '1 minute' where id = current_setting('test.event')::uuid;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
update attendance set status = 'not_going' where event_id = current_setting('test.event')::uuid and user_id = auth.uid();
select pg_temp.check((select status = 'going' from attendance where event_id = current_setting('test.event')::uuid and user_id = auth.uid()),
                     'locked answer cannot be changed by player');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
update attendance set status = 'late' where event_id = current_setting('test.event')::uuid and user_id = '00000000-0000-0000-0000-00000000000b';
select pg_temp.check((select status = 'late' from attendance where event_id = current_setting('test.event')::uuid
                      and user_id = '00000000-0000-0000-0000-00000000000b'), 'staff can answer for players');

-- Changing only the series title keeps answers; changing the time resets them
update event_series set title = 'Sunday training';
select pg_temp.check((select title = 'Sunday training' from events where id = current_setting('test.event')::uuid), 'title change propagates');
select pg_temp.check((select status = 'late' from attendance where event_id = current_setting('test.event')::uuid
                      and user_id = '00000000-0000-0000-0000-00000000000b'), 'title change keeps answers');
update event_series set start_time = '11:00';
select pg_temp.check((select bool_and((starts_at at time zone 'Europe/Berlin')::time = '11:00') from events where series_id is not null),
                     'time change regenerates events');

-- Outsiders see nothing and cannot join without the code
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.check((select count(*) = 0 from teams), 'outsider sees no teams');
select pg_temp.check((select count(*) = 0 from events), 'outsider sees no events');
select pg_temp.check((select count(*) = 0 from attendance), 'outsider sees no attendance');
select pg_temp.check((select count(*) = 1 from profiles), 'outsider sees only own profile');
select pg_temp.check((select count(*) = 0 from absences), 'outsider sees no absences');
do $$ begin
  perform join_team('WRONG123');
  raise exception 'FAILED: joined with a wrong code';
exception when no_data_found then null;
end $$;

-- Signed-out visitors see nothing at all
reset role;
set role anon;
select pg_temp.as_user(null);
do $$ begin
  perform count(*) from events;
  raise exception 'FAILED: anon read events';
exception when insufficient_privilege then null;
end $$;

-- Ben leaves: his future rows go; the last owner cannot leave
reset role;
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
delete from team_members where user_id = auth.uid();
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.check((select count(*) = 0 from attendance a join events e on e.id = a.event_id
                      where a.user_id = '00000000-0000-0000-0000-00000000000b' and e.starts_at > now()), 'leaver''s future rows removed');
do $$ begin
  delete from team_members where user_id = auth.uid();
  raise exception 'FAILED: last owner left';
exception when raise_exception then
  if sqlerrm like 'FAILED%' then raise; end if;
end $$;

-- The owner can delete the whole team
delete from teams;
reset role;
select pg_temp.check((select count(*) = 0 from teams) and (select count(*) = 0 from events), 'team deleted with its events');

\o
select 'ALL PASSED' as result;
