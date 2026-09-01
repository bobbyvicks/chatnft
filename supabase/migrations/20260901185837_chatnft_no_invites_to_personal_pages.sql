-- An invite link is a key to a workspace. Your personal page is a workspace,
-- which means the invite button - offered on every page alike - would happily
-- mint a key to the place you keep your own work, and nothing about the button
-- said so. Nobody would notice until someone else was already in there.
--
-- Refused in the database rather than only hidden in the page: the button is
-- one caller of this function, not its only possible one, and hiding a control
-- is not the same as removing the ability behind it.
create or replace function public.make_invite(p_team uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  tok text;
  is_personal boolean;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if not public.is_team_member(p_team) then raise exception 'not your project'; end if;
  select personal into is_personal from public.teams where id = p_team;
  -- Distinguished from "personal is false": a missing row means the id is not a
  -- project at all, and reporting that as "you cannot invite to your own page"
  -- would be a confidently wrong explanation.
  if is_personal is null then raise exception 'no such project'; end if;
  if is_personal then
    raise exception 'you cannot invite people to your own page - make a group project first';
  end if;
  tok := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.team_invites(token, team_id, created_by) values (tok, p_team, uid);
  return tok;
end $$;

-- Any link already minted against a personal page is exactly the key this
-- function now refuses to cut, and it stays valid for a fortnight. Closing the
-- door without withdrawing the keys already handed out would leave the hole
-- open for as long as the oldest of them lives.
update public.team_invites i
   set revoked = true
  from public.teams t
 where t.id = i.team_id
   and t.personal
   and i.revoked = false;
