-- Collections and traits are now reached through team membership. The old
-- owner-based policies are dropped rather than left beside the new ones: two
-- permissive policies OR together, so leaving the old one would silently keep
-- granting access by owner and the team rules would never be the thing tested.
drop policy if exists collections_own on public.collections;
drop policy if exists traits_own      on public.traits;

alter table public.collections alter column owner drop not null;
alter table public.traits      alter column owner drop not null;

create policy collections_team on public.collections
  for all to authenticated
  using (team_id is not null and public.is_team_member(team_id))
  with check (team_id is not null and public.is_team_member(team_id));

create policy traits_team on public.traits
  for all to authenticated
  using (team_id is not null and public.is_team_member(team_id))
  with check (team_id is not null and public.is_team_member(team_id));

-- Storage moves from <owner>/... to <team>/..., so the first path segment is
-- now the team and the check is membership rather than identity.
drop policy if exists "traits read own"   on storage.objects;
drop policy if exists "traits insert own" on storage.objects;
drop policy if exists "traits update own" on storage.objects;
drop policy if exists "traits delete own" on storage.objects;

create policy "traits read team" on storage.objects
  for select to authenticated
  using (bucket_id='traits'
         and public.is_team_member(((storage.foldername(name))[1])::uuid));
create policy "traits insert team" on storage.objects
  for insert to authenticated
  with check (bucket_id='traits'
              and public.is_team_member(((storage.foldername(name))[1])::uuid));
create policy "traits update team" on storage.objects
  for update to authenticated
  using (bucket_id='traits'
         and public.is_team_member(((storage.foldername(name))[1])::uuid))
  with check (bucket_id='traits'
              and public.is_team_member(((storage.foldername(name))[1])::uuid));
create policy "traits delete team" on storage.objects
  for delete to authenticated
  using (bucket_id='traits'
         and public.is_team_member(((storage.foldername(name))[1])::uuid));

-- Getting a team on first use. Creating the team and the membership row in one
-- server-side step, because a client that creates the team and then fails to
-- insert the membership leaves an orphan nobody can reach or delete.
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
  select m.team_id into t from public.team_members m
   where m.user_id = uid order by m.joined_at limit 1;
  if t is not null then return t; end if;
  insert into public.teams(name, created_by) values ('My team', uid) returning id into t;
  insert into public.team_members(team_id, user_id, role) values (t, uid, 'owner');
  return t;
end $$;
revoke all on function public.my_team() from public, anon;
grant execute on function public.my_team() to authenticated;

-- Redeeming an invite. This is the ONLY way to become a member, which is why
-- team_members has no insert policy at all: the token cannot be routed around
-- by writing the row directly.
create or replace function public.join_team(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  inv public.team_invites%rowtype;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into inv from public.team_invites
   where token = p_token and revoked = false and expires_at > now();
  -- One message for every failure: a wrong token, an expired one and a revoked
  -- one must be indistinguishable, or the response tells someone probing which
  -- tokens exist.
  if not found then raise exception 'that invite is not valid'; end if;
  insert into public.team_members(team_id, user_id, role)
  values (inv.team_id, uid, 'member')
  on conflict (team_id, user_id) do nothing;
  return inv.team_id;
end $$;
revoke all on function public.join_team(text) from public, anon;
grant execute on function public.join_team(text) to authenticated;

-- Making an invite. The token is generated in the DATABASE from pgcrypto, not
-- in the browser: Math.random is not unpredictable, and a guessable invite is
-- an open door to the team's whole collection.
create or replace function public.make_invite(p_team uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  tok text;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if not public.is_team_member(p_team) then raise exception 'not your team'; end if;
  tok := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.team_invites(token, team_id, created_by) values (tok, p_team, uid);
  return tok;
end $$;
revoke all on function public.make_invite(uuid) from public, anon;
grant execute on function public.make_invite(uuid) to authenticated;