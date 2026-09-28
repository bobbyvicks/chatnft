-- What the live PixelBench database has that replaying supabase/migrations does not.
-- Printed by test/sql/print-drift.mjs from supabase/fixtures/live-catalog-2026-09-28.json,
-- captured 2026-09-28T03:11:51Z, before Change A0. Schema only. test/sql/harness.mjs
-- applies it after the migrations and before A0.

set role pb_owner;
alter table public."collections" add column if not exists "decide_order" jsonb default '[]'::jsonb not null;
alter table public."collections" add column if not exists "decisions" jsonb default '[]'::jsonb not null;
alter table public."collections" add column if not exists "rules" jsonb default '[]'::jsonb not null;
CREATE OR REPLACE FUNCTION public.make_invite(p_team uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  uid uuid := (select auth.uid());
  tok text;
  is_personal boolean;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if not public.is_team_member(p_team) then raise exception 'not your project'; end if;
  select personal into is_personal from public.teams where id = p_team;
  if is_personal is null then raise exception 'no such project'; end if;
  if is_personal then
    raise exception 'you cannot invite people to your own page - make a group project first';
  end if;
  tok := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.team_invites(token, team_id, created_by) values (tok, p_team, uid);
  return tok;
end $function$;
revoke all on function public.make_invite(p_team uuid) from public, anon, authenticated;
grant execute on function public.make_invite(p_team uuid) to authenticated;
reset role;
CREATE OR REPLACE FUNCTION auth.uid()
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$function$;
CREATE OR REPLACE FUNCTION storage.foldername(name text)
 RETURNS text[]
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
    _parts text[];
BEGIN
    -- Split on "/" to get path segments
    SELECT string_to_array(name, '/') INTO _parts;
    -- Return everything except the last segment
    RETURN _parts[1 : array_length(_parts,1) - 1];
END
$function$;

