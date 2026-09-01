-- Someone arriving on an invite link should be told what they are being invited
-- to before they hand over an email address. Invites are readable only by
-- members, deliberately, so this returns the ONE fact a stranger needs - the
-- project's name - and nothing else: not who made it, not who is in it, not
-- when it expires.
--
-- It does confirm that a token is valid, which is inherent in an invite link
-- working at all. Tokens are 24 random bytes from the database, so confirming
-- validity is not a way to find one.
create or replace function public.invite_info(p_token text)
returns text
language plpgsql
security definer
stable
set search_path = ''
as $$
declare nm text;
begin
  select t.name into nm
    from public.team_invites i
    join public.teams t on t.id = i.team_id
   where i.token = p_token and i.revoked = false and i.expires_at > now();
  -- null, not an exception: this is a lookup on the sign-in screen, and a
  -- stranger with a stale link should see a plain message rather than an error.
  return nm;
end $$;
revoke all on function public.invite_info(text) from public;
-- anon too: the whole point is that it works BEFORE there is an account.
grant execute on function public.invite_info(text) to anon, authenticated;