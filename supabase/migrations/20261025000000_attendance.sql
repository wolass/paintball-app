-- Step 1: teams, events (one-off and recurring), attendance and absences.
-- Every table has row-level security; nothing is readable without being a team member.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.team_role as enum ('owner', 'coach', 'player');
create type public.event_kind as enum ('practice', 'tournament', 'meeting', 'other');
create type public.rsvp_status as enum ('pending', 'going', 'late', 'maybe', 'not_going');
create type public.absence_reason as enum ('holiday', 'injury', 'work', 'sick', 'other');
create type public.player_position as enum ('front', 'snake', 'dorito', 'mid', 'back', 'flex');

-- ---------------------------------------------------------------------------
-- Generic updated_at trigger
-- ---------------------------------------------------------------------------

create function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Profiles: one per auth user, created automatically on sign-up
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  locale text not null default 'en',
  primary_position public.player_position not null default 'flex',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1), ''));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Teams and memberships
-- ---------------------------------------------------------------------------

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  timezone text not null default 'Europe/Berlin',
  default_players_per_side int not null default 5 check (default_players_per_side between 1 and 15),
  invite_code text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger teams_updated_at before update on public.teams
  for each row execute function public.set_updated_at();

create table public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.team_role not null default 'player',
  jersey_number text,
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create index team_members_user_idx on public.team_members (user_id);

-- Helpers used by the security policies. security definer avoids recursive policy checks.
create function public.is_team_member(p_team uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_members where team_id = p_team and user_id = auth.uid());
$$;

create function public.is_team_staff(p_team uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from team_members
    where team_id = p_team and user_id = auth.uid() and role in ('owner', 'coach')
  );
$$;

create function public.shares_team_with(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from team_members a join team_members b on a.team_id = b.team_id
    where a.user_id = auth.uid() and b.user_id = p_user
  );
$$;

-- The creator of a team becomes its owner.
create function public.handle_new_team() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into team_members (team_id, user_id, role) values (new.id, new.created_by, 'owner');
  return new;
end $$;

create trigger on_team_created after insert on public.teams
  for each row execute function public.handle_new_team();

-- Join a team with its invite code. Returns the team id.
create function public.join_team(p_invite_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_team uuid;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  select id into v_team from teams where invite_code = upper(trim(p_invite_code));
  if v_team is null then
    raise exception 'invalid invite code' using errcode = 'P0002';
  end if;
  insert into team_members (team_id, user_id) values (v_team, auth.uid())
  on conflict do nothing;
  return v_team;
end $$;

-- Owners can issue a new code, which invalidates the old one.
create function public.regenerate_invite_code(p_team uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_code text := upper(substr(md5(gen_random_uuid()::text), 1, 8));
begin
  if not exists (select 1 from team_members where team_id = p_team and user_id = auth.uid() and role = 'owner') then
    raise exception 'only the team owner can do this';
  end if;
  update teams set invite_code = v_code where id = p_team;
  return v_code;
end $$;

-- ---------------------------------------------------------------------------
-- Events. A recurring practice is an event_series that generates events.
-- ---------------------------------------------------------------------------

create table public.event_series (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  kind public.event_kind not null default 'practice',
  title text not null,
  location text,
  notes text,
  -- ISO weekdays, 1 = Monday ... 7 = Sunday
  weekdays int[] not null check (array_length(weekdays, 1) > 0 and weekdays <@ array[1,2,3,4,5,6,7]),
  interval_weeks int not null default 1 check (interval_weeks between 1 and 8),
  start_time time not null,
  duration_minutes int not null default 120 check (duration_minutes > 0),
  starts_on date not null,
  ends_on date,
  players_per_side int check (players_per_side between 1 and 15),
  rsvp_lock_hours int check (rsvp_lock_hours >= 0),
  generated_until date,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);

create trigger event_series_updated_at before update on public.event_series
  for each row execute function public.set_updated_at();

create table public.events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  series_id uuid references public.event_series (id) on delete cascade,
  kind public.event_kind not null default 'practice',
  title text not null,
  location text,
  notes text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  -- Per-event game settings so the app stays league-agnostic (ICS, NXL, ALPS, ...).
  players_per_side int check (players_per_side between 1 and 15),
  league text,
  format text,
  roster_limit int check (roster_limit > 0),
  -- After this moment players can no longer change their answer (staff still can).
  rsvp_locks_at timestamptz,
  cancelled boolean not null default false,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);

create index events_team_start_idx on public.events (team_id, starts_at);
create unique index events_series_start_idx on public.events (series_id, starts_at) where series_id is not null;

create trigger events_updated_at before update on public.events
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Absences: holidays, injuries etc. Answer "not going" automatically.
-- ---------------------------------------------------------------------------

create table public.absences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  reason public.absence_reason not null default 'other',
  note text,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create index absences_user_idx on public.absences (user_id, starts_on, ends_on);

-- ---------------------------------------------------------------------------
-- Attendance: one row per member per event
-- ---------------------------------------------------------------------------

create table public.attendance (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status public.rsvp_status not null default 'pending',
  comment text,
  absence_id uuid references public.absences (id) on delete set null,
  responded_at timestamptz,
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index attendance_user_idx on public.attendance (user_id);

create function public.attendance_before_update() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  if new.status is distinct from old.status or new.comment is distinct from old.comment then
    new.responded_at := case when new.status = 'pending' then null else now() end;
    new.updated_by := coalesce(auth.uid(), new.updated_by);
    -- A manual answer replaces the automatic one from an absence.
    if new.absence_id is not distinct from old.absence_id then
      new.absence_id := null;
    end if;
  end if;
  return new;
end $$;

create trigger attendance_before_update before update on public.attendance
  for each row execute function public.attendance_before_update();

-- Which absence (if any) covers a user on a given event date, in the team's time zone.
create function public.covering_absence(p_user uuid, p_starts_at timestamptz, p_timezone text) returns uuid
language sql stable security definer set search_path = public as $$
  select id from absences
  where user_id = p_user
    and (p_starts_at at time zone p_timezone)::date between starts_on and ends_on
  order by created_at
  limit 1;
$$;

-- New event: create a row for every member, pre-answered if they are absent.
create function public.handle_new_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_tz text;
begin
  select timezone into v_tz from teams where id = new.team_id;
  insert into attendance (event_id, user_id, status, absence_id, responded_at)
  select new.id, m.user_id,
         case when a.id is null then 'pending'::rsvp_status else 'not_going'::rsvp_status end,
         a.id,
         case when a.id is null then null else now() end
  from team_members m
  left join lateral (select covering_absence(m.user_id, new.starts_at, v_tz) as id) a on true
  where m.team_id = new.team_id;
  return new;
end $$;

create trigger on_event_created after insert on public.events
  for each row execute function public.handle_new_event();

-- New member: create rows for the team's upcoming events.
create function public.handle_new_member() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_tz text;
begin
  select timezone into v_tz from teams where id = new.team_id;
  insert into attendance (event_id, user_id, status, absence_id, responded_at)
  select e.id, new.user_id,
         case when a.id is null then 'pending'::rsvp_status else 'not_going'::rsvp_status end,
         a.id,
         case when a.id is null then null else now() end
  from events e
  left join lateral (select covering_absence(new.user_id, e.starts_at, v_tz) as id) a on true
  where e.team_id = new.team_id and e.starts_at > now()
  on conflict do nothing;
  return new;
end $$;

create trigger on_member_added after insert on public.team_members
  for each row execute function public.handle_new_member();

-- A member who leaves loses their open answers for future events.
create function public.handle_member_removed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from attendance at
  using events e
  where at.event_id = e.id and e.team_id = old.team_id and at.user_id = old.user_id and e.starts_at > now();
  return old;
end $$;

create trigger on_member_removed after delete on public.team_members
  for each row execute function public.handle_member_removed();

-- Absence added or changed: mark covered upcoming events as not going,
-- and reopen events the absence no longer covers.
create function public.apply_absence(p_absence uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update attendance at
  set status = 'not_going', absence_id = ab.id, responded_at = now(), updated_at = now()
  from absences ab, events e, teams t
  where ab.id = p_absence
    and at.user_id = ab.user_id
    and at.event_id = e.id
    and e.team_id = t.id
    and e.starts_at > now()
    and (e.starts_at at time zone t.timezone)::date between ab.starts_on and ab.ends_on;
end $$;

create function public.release_absence(p_absence uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update attendance at
  set status = 'pending', absence_id = null, responded_at = null, updated_at = now()
  from events e
  where at.absence_id = p_absence and at.user_id = p_user and at.event_id = e.id and e.starts_at > now();
end $$;

create function public.handle_absence_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform release_absence(old.id, old.user_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform apply_absence(new.id);
    return new;
  end if;
  return old;
end $$;

-- BEFORE DELETE so the attendance rows still point at the absence when they are released.
create trigger on_absence_written after insert or update on public.absences
  for each row execute function public.handle_absence_change();
create trigger on_absence_deleted before delete on public.absences
  for each row execute function public.handle_absence_change();

-- ---------------------------------------------------------------------------
-- Recurring events: materialise occurrences a number of weeks ahead
-- ---------------------------------------------------------------------------

create function public.generate_series_events(p_series uuid, p_weeks_ahead int default 12) returns int
language plpgsql security definer set search_path = public as $$
declare
  s event_series;
  v_tz text;
  v_until date;
  v_from date;
  v_day date;
  v_start timestamptz;
  v_count int := 0;
begin
  select * into s from event_series where id = p_series;
  if not found then
    return 0;
  end if;
  select timezone into v_tz from teams where id = s.team_id;

  v_until := (now() at time zone v_tz)::date + p_weeks_ahead * 7;
  if s.ends_on is not null and s.ends_on < v_until then
    v_until := s.ends_on;
  end if;
  v_from := greatest(s.starts_on, coalesce(s.generated_until + 1, s.starts_on), (now() at time zone v_tz)::date);

  v_day := v_from;
  while v_day <= v_until loop
    if extract(isodow from v_day)::int = any (s.weekdays)
       and ((v_day - (s.starts_on - (extract(isodow from s.starts_on)::int - 1))) / 7) % s.interval_weeks = 0 then
      v_start := (v_day + s.start_time) at time zone v_tz;
      if v_start > now() then
        insert into events (team_id, series_id, kind, title, location, notes, starts_at, ends_at,
                            players_per_side, rsvp_locks_at, created_by)
        values (s.team_id, s.id, s.kind, s.title, s.location, s.notes, v_start,
                v_start + make_interval(mins => s.duration_minutes), s.players_per_side,
                case when s.rsvp_lock_hours is null then null
                     else v_start - make_interval(hours => s.rsvp_lock_hours) end,
                s.created_by)
        on conflict do nothing;
        if found then
          v_count := v_count + 1;
        end if;
      end if;
    end if;
    v_day := v_day + 1;
  end loop;

  update event_series set generated_until = greatest(coalesce(generated_until, v_until), v_until) where id = s.id;
  return v_count;
end $$;

-- Called daily (see the cron migration) to keep every series filled ahead.
create function public.extend_all_series() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_total int := 0;
begin
  for v_id in select id from event_series where ends_on is null or ends_on >= current_date loop
    v_total := v_total + generate_series_events(v_id);
  end loop;
  return v_total;
end $$;

revoke execute on function public.extend_all_series() from public, anon, authenticated;
revoke execute on function public.generate_series_events(uuid, int) from public, anon, authenticated;
revoke execute on function public.apply_absence(uuid) from public, anon, authenticated;
revoke execute on function public.release_absence(uuid, uuid) from public, anon, authenticated;

create function public.handle_series_written() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if (new.weekdays, new.interval_weeks, new.start_time, new.duration_minutes, new.starts_on, new.ends_on, new.rsvp_lock_hours)
       is distinct from
       (old.weekdays, old.interval_weeks, old.start_time, old.duration_minutes, old.starts_on, old.ends_on, old.rsvp_lock_hours) then
      -- The schedule changed: rebuild future occurrences (their answers are reset).
      delete from events where series_id = new.id and starts_at > now();
      update event_series set generated_until = null where id = new.id;
    else
      -- Only details changed: update future occurrences and keep everyone's answers.
      update events
      set title = new.title, location = new.location, notes = new.notes, kind = new.kind,
          players_per_side = new.players_per_side
      where series_id = new.id and starts_at > now();
    end if;
  end if;
  perform generate_series_events(new.id);
  return new;
end $$;

create trigger on_series_written after insert or update of weekdays, interval_weeks, start_time, duration_minutes,
  starts_on, ends_on, title, location, notes, kind, players_per_side, rsvp_lock_hours on public.event_series
  for each row execute function public.handle_series_written();

-- ---------------------------------------------------------------------------
-- Web push subscriptions (used by the reminders function)
-- ---------------------------------------------------------------------------

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.event_series enable row level security;
alter table public.events enable row level security;
alter table public.absences enable row level security;
alter table public.attendance enable row level security;
alter table public.push_subscriptions enable row level security;

-- profiles
create policy "read own and teammates' profiles" on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_team_with(id));
create policy "update own profile" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- teams
create policy "members read their teams" on public.teams for select to authenticated
  using (public.is_team_member(id) or created_by = auth.uid());
create policy "anyone signed in creates a team" on public.teams for insert to authenticated
  with check (created_by = auth.uid());
create policy "staff update the team" on public.teams for update to authenticated
  using (public.is_team_staff(id)) with check (public.is_team_staff(id));
create policy "owner deletes the team" on public.teams for delete to authenticated
  using (exists (select 1 from public.team_members where team_id = id and user_id = auth.uid() and role = 'owner'));

-- team_members (joining goes through join_team())
create policy "members see their teammates" on public.team_members for select to authenticated
  using (public.is_team_member(team_id));
create policy "staff edit members" on public.team_members for update to authenticated
  using (public.is_team_staff(team_id)) with check (public.is_team_staff(team_id));
create policy "leave a team or staff removes a member" on public.team_members for delete to authenticated
  using (user_id = auth.uid() or public.is_team_staff(team_id));

-- Only owners may hand out the owner role, and a team keeps at least one owner.
create function public.guard_member_roles() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and new.role is distinct from old.role
     and (new.role = 'owner' or old.role = 'owner')
     and not exists (select 1 from team_members where team_id = new.team_id and user_id = auth.uid() and role = 'owner') then
    raise exception 'only an owner can change owner roles';
  end if;
  if ((tg_op = 'DELETE' and old.role = 'owner') or (tg_op = 'UPDATE' and old.role = 'owner' and new.role <> 'owner'))
     and not exists (select 1 from team_members where team_id = old.team_id and role = 'owner' and user_id <> old.user_id)
     and exists (select 1 from teams where id = old.team_id) then
    raise exception 'a team needs at least one owner';
  end if;
  return coalesce(new, old);
end $$;

create trigger guard_member_roles before update or delete on public.team_members
  for each row execute function public.guard_member_roles();

-- event_series and events
create policy "members read series" on public.event_series for select to authenticated
  using (public.is_team_member(team_id));
create policy "staff create series" on public.event_series for insert to authenticated
  with check (public.is_team_staff(team_id) and created_by = auth.uid());
create policy "staff update series" on public.event_series for update to authenticated
  using (public.is_team_staff(team_id)) with check (public.is_team_staff(team_id));
create policy "staff delete series" on public.event_series for delete to authenticated
  using (public.is_team_staff(team_id));

create policy "members read events" on public.events for select to authenticated
  using (public.is_team_member(team_id));
create policy "staff create events" on public.events for insert to authenticated
  with check (public.is_team_staff(team_id) and created_by = auth.uid());
create policy "staff update events" on public.events for update to authenticated
  using (public.is_team_staff(team_id)) with check (public.is_team_staff(team_id));
create policy "staff delete events" on public.events for delete to authenticated
  using (public.is_team_staff(team_id));

-- absences: your own, and staff of a shared team can see them (to plan lines)
create policy "read own and teammates' absences" on public.absences for select to authenticated
  using (user_id = auth.uid() or public.shares_team_with(user_id));
create policy "add own absence" on public.absences for insert to authenticated
  with check (user_id = auth.uid());
create policy "edit own absence" on public.absences for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete own absence" on public.absences for delete to authenticated
  using (user_id = auth.uid());

-- attendance: rows are created by triggers; players answer for themselves
-- until the lock time, staff can answer for anyone at any time.
create policy "members read attendance" on public.attendance for select to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and public.is_team_member(e.team_id)));
create policy "answer for yourself before the lock" on public.attendance for update to authenticated
  using (
    user_id = auth.uid()
    and exists (select 1 from public.events e where e.id = event_id and not e.cancelled
                and (e.rsvp_locks_at is null or now() < e.rsvp_locks_at))
  )
  with check (user_id = auth.uid());
create policy "staff answer for anyone" on public.attendance for update to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and public.is_team_staff(e.team_id)))
  with check (exists (select 1 from public.events e where e.id = event_id and public.is_team_staff(e.team_id)));

-- Column-level limits on top of the policies.
revoke update on public.teams from authenticated;
grant update (name, timezone, default_players_per_side) on public.teams to authenticated;
revoke update on public.team_members from authenticated;
grant update (role, jersey_number) on public.team_members to authenticated;

-- Players may only change their answer and comment, never move a row to another event or user.
revoke update on public.attendance from authenticated;
grant update (status, comment) on public.attendance to authenticated;

-- push_subscriptions: strictly your own
create policy "own push subscriptions" on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Nothing is available to signed-out visitors.
revoke all on all tables in schema public from anon;
