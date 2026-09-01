-- Private bucket for the PNGs. Path convention:
--   <owner uuid>/<collection uuid>/<trait uuid>.png
-- The first segment being the owner is what the storage policies key on, so the
-- path is not merely a name - it is the authorisation.
--
-- The version in this filename matches the row already in
-- supabase_migrations.schema_migrations, so the Git integration treats this as
-- applied and skips it.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('traits', 'traits', false, 5242880, array['image/png'])
on conflict (id) do nothing;

-- Separate policies per command rather than FOR ALL: an upload and a delete are
-- different risks and being able to read them apart matters when auditing.
create policy "traits read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'traits'
         and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "traits insert own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'traits'
              and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "traits update own" on storage.objects
  for update to authenticated
  using (bucket_id = 'traits'
         and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'traits'
              and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "traits delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'traits'
         and (storage.foldername(name))[1] = (select auth.uid())::text);
