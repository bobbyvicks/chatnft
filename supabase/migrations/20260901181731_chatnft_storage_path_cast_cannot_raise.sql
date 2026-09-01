-- The storage policies cast the first path segment straight to uuid. A cast is
-- not a check: an object whose first segment is not a uuid makes the cast RAISE,
-- and a policy that raises does not deny the row, it fails the whole query. One
-- badly named object would break listing for everybody.
--
-- This returns false instead, which is what "not allowed" should look like.
create or replace function public.is_team_path(p text)
returns boolean
language plpgsql
security definer
stable
set search_path = ''
as $$
declare t uuid;
begin
  begin
    t := ((storage.foldername(p))[1])::uuid;
  exception when others then
    return false;
  end;
  if t is null then return false; end if;
  return public.is_team_member(t);
end $$;
revoke all on function public.is_team_path(text) from public, anon;
grant execute on function public.is_team_path(text) to authenticated;

drop policy if exists "traits read team"   on storage.objects;
drop policy if exists "traits insert team" on storage.objects;
drop policy if exists "traits update team" on storage.objects;
drop policy if exists "traits delete team" on storage.objects;

create policy "traits read team" on storage.objects
  for select to authenticated
  using (bucket_id='traits' and public.is_team_path(name));
create policy "traits insert team" on storage.objects
  for insert to authenticated
  with check (bucket_id='traits' and public.is_team_path(name));
create policy "traits update team" on storage.objects
  for update to authenticated
  using (bucket_id='traits' and public.is_team_path(name))
  with check (bucket_id='traits' and public.is_team_path(name));
create policy "traits delete team" on storage.objects
  for delete to authenticated
  using (bucket_id='traits' and public.is_team_path(name));