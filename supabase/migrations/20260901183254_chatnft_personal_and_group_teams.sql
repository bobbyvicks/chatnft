-- A person now has a personal space AND any number of group projects, so the
-- two have to be told apart. Without this flag my_team() returns whichever team
-- was joined first, which after accepting one invite is somebody else's group -
-- and inviting people would still be inviting them into your personal page.
alter table public.teams add column personal boolean not null default false;

-- Exactly one personal team each. A partial unique index rather than a check,
-- because the constraint is about the SET of a user's teams, not about one row.
create unique index teams_one_personal_each
  on public.teams(created_by) where personal;

-- Returns the personal team specifically, not "the first one".
create or replace function public.my_team()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  t uuid;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select tm.id into t
    from public.teams tm
    join public.team_members m on m.team_id = tm.id and m.user_id = uid
   where tm.personal
   limit 1;
  if t is not null then return t; end if;
  insert into public.teams(name, created_by, personal)
  values ('My page', uid, true) returning id into t;
  insert into public.team_members(team_id, user_id, role) values (t, uid, 'owner');
  return t;
end $$;
revoke all on function public.my_team() from public, anon;
grant execute on function public.my_team() to authenticated;

-- A group project. Separate from the personal team on purpose: inviting someone
-- should never be a way into the place you keep your own work.
create or replace function public.create_team(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  nm text := nullif(btrim(coalesce(p_name,'')),'');
  t uuid;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if nm is null then nm := 'Group project'; end if;
  if length(nm) > 60 then nm := left(nm,60); end if;
  insert into public.teams(name, created_by, personal) values (nm, uid, false) returning id into t;
  insert into public.team_members(team_id, user_id, role) values (t, uid, 'owner');
  return t;
end $$;
revoke all on function public.create_team(text) from public, anon;
grant execute on function public.create_team(text) to authenticated;

-- Leaving a group. The personal team cannot be left, because nothing would
-- own the work in it and my_team() would silently make a second empty one.
create or replace function public.leave_team(p_team uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  is_personal boolean;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select personal into is_personal from public.teams where id = p_team;
  if is_personal is null then raise exception 'no such project'; end if;
  if is_personal then raise exception 'you cannot leave your own page'; end if;
  delete from public.team_members where team_id = p_team and user_id = uid;
  return true;
end $$;
revoke all on function public.leave_team(uuid) from public, anon;
grant execute on function public.leave_team(uuid) to authenticated;