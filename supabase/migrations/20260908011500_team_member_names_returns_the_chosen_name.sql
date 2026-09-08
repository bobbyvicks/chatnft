-- The name a person CHOSE, not the one they type to sign in.
--
-- Sign-up asks for two things and stores both: an account name, which becomes
-- the login and the local part of the @chatnft.invalid address, and a name,
-- asked for in the form as "whatever you want people you share a project with
-- to call you". The first version of this function returned only the account
-- name, so the field written for exactly this purpose was never shown to
-- anybody. Measured before changing it: every member of Market Makers has both
-- set, and the panel showed all three by their login handle.
--
-- coalesce, not a swap: somebody who joined by invite link has an account name
-- and no chosen name, and the handle is a better answer than nothing. Both are
-- nullif'd first because an empty string is a value the metadata can hold and
-- is not a name.
--
-- STILL NO EMAIL, which is the whole reason this function exists rather than a
-- view over auth.users. Neither column it reads is the address, and the part
-- before the @ - the obvious fallback - is deliberately not one of them.
--
-- The column is renamed, which postgres will not do through create or replace,
-- so this drops and recreates. That drops the ACL with it: the revoke and the
-- grant below are not decoration, and the migration is verified afterwards
-- against has_function_privilege rather than against the definition alone.
drop function if exists public.team_member_names(uuid);

create function public.team_member_names(t uuid)
returns table (user_id uuid, display_name text)
language sql
stable
security definer
set search_path to ''
as $function$
  select m.user_id,
         coalesce(nullif(u.raw_user_meta_data->>'name',''),
                  nullif(u.raw_user_meta_data->>'username',''))
    from public.team_members m
    join auth.users u on u.id = m.user_id
   where m.team_id = t
     and public.is_team_member(t);
$function$;

revoke all on function public.team_member_names(uuid) from public, anon;
grant execute on function public.team_member_names(uuid) to authenticated;
