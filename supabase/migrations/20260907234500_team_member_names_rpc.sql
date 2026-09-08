-- Who changed what, without handing anybody an email address.
--
-- traits.owner records who last wrote a row, and every row on the server has
-- one - but a uuid is not a name, and usernames live in auth.users, which
-- PostgREST does not expose and no client may read. So "wilson changed Blue
-- Gorilla" was not expressible: the data was there and the name was not.
--
-- IT RETURNS THE USERNAME AND NOTHING ELSE. Not the email, and not the part of
-- the address before the @, which was the obvious fallback and would have
-- handed every teammate the local part of a real one. Somebody who has not set
-- a username comes back null and the client shows "someone" - a gap worth
-- showing as a gap.
--
-- Gated on is_team_member, the same helper the RLS policies use, so it answers
-- only for a team the CALLER belongs to. Security definer is what lets it read
-- auth.users at all; the gate is what stops that being a way to enumerate
-- them. search_path is emptied and every name fully qualified, matching the
-- other definer functions here.
--
-- Verified after applying, from the live catalog: prosecdef true, anon and
-- public cannot execute, authenticated can, the definition contains no
-- reference to email, and a team the caller does not belong to returns zero
-- rows.
create or replace function public.team_member_names(t uuid)
returns table (user_id uuid, username text)
language sql
stable
security definer
set search_path to ''
as $function$
  select m.user_id,
         nullif(u.raw_user_meta_data->>'username','')
    from public.team_members m
    join auth.users u on u.id = m.user_id
   where m.team_id = t
     and public.is_team_member(t);
$function$;

revoke all on function public.team_member_names(uuid) from public, anon;
grant execute on function public.team_member_names(uuid) to authenticated;
