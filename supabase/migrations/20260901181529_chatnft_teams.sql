-- Teams. A collection belongs to a TEAM, never directly to a person, so
-- sharing is the same code path as not sharing - a solo user simply has a team
-- of one. The alternative, "owner, plus a list of people who can also see it",
-- means every policy has two cases and one of them is always the untested one.

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'My team',
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index team_members_user_idx on public.team_members(user_id);

-- The token IS the invitation, so it must be unguessable and it must expire.
-- Nothing readable by a non-member, or the tokens could be listed.
create table public.team_invites (
  token text primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  revoked boolean not null default false
);
create index team_invites_team_idx on public.team_invites(team_id);

-- Collections and traits move from a person to a team.
alter table public.collections add column team_id uuid references public.teams(id) on delete cascade;
alter table public.traits      add column team_id uuid references public.teams(id) on delete cascade;
create index collections_team_idx on public.collections(team_id);
create index traits_team_idx on public.traits(team_id);

-- Membership is checked through a SECURITY DEFINER function on purpose. A
-- policy on team_members that selects from team_members recurses forever;
-- Postgres detects it and errors, so the feature would simply not work. The
-- function runs outside RLS, which breaks the cycle. search_path is pinned
-- because a security definer function with a mutable search_path can be
-- pointed at an attacker's table of the same name.
create or replace function public.is_team_member(t uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.team_members m
     where m.team_id = t and m.user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_team_member(uuid) from public, anon;
grant execute on function public.is_team_member(uuid) to authenticated;

alter table public.teams         enable row level security;
alter table public.team_members  enable row level security;
alter table public.team_invites  enable row level security;

-- Read your teams; create one for yourself. Renaming and deleting are not
-- exposed yet rather than exposed loosely.
create policy teams_read on public.teams
  for select to authenticated using (public.is_team_member(id));
create policy teams_create on public.teams
  for insert to authenticated with check (created_by = (select auth.uid()));

-- See who is on a team you are on. Joining happens only through the redeem
-- function; there is deliberately no INSERT policy, so a token cannot be
-- bypassed by writing the row directly.
create policy members_read on public.team_members
  for select to authenticated using (public.is_team_member(team_id));
create policy members_leave on public.team_members
  for delete to authenticated using (user_id = (select auth.uid()));

-- Invites are visible only to the team, so tokens cannot be harvested.
create policy invites_read on public.team_invites
  for select to authenticated using (public.is_team_member(team_id));
create policy invites_create on public.team_invites
  for insert to authenticated
  with check (public.is_team_member(team_id) and created_by = (select auth.uid()));
create policy invites_revoke on public.team_invites
  for update to authenticated
  using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));