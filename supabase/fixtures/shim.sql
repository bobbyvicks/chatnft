-- What a Supabase project has before its first migration runs, for PGlite.
--
-- Not a copy of Supabase: only what supabase/migrations reaches. What
-- test/sql/replay.test.mjs checks against the live capture: the roles'
-- schema USAGE (schema| rows), auth.uid() and storage.foldername() (fn|
-- rows, bodies and EXECUTE), and the policies on storage (pol| rows).
-- What it does NOT check, because the capture holds no row for it: the
-- columns, constraints and triggers of auth.users, storage.buckets and
-- storage.objects, and row level security on storage.objects. Those are
-- stand-ins with the columns the migrations name; plan 2's storage fake
-- (design A4, E4) replaces them with live's, captured and checked.
--
-- pb_owner stands in for live's "postgres": it owns and runs the migrations,
-- is NOT a superuser, and bypasses row level security - so a SECURITY
-- DEFINER function here has the power it has live and no more (design E4).
-- The session itself stays the PGlite superuser, so a test can always get
-- back from any role it switches to.

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role pb_owner nologin noinherit bypassrls;

create schema auth;
create table auth.users (
  id uuid primary key,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);
-- Supabase's form. test/sql/replay.test.mjs compares it with live's
-- pg_get_functiondef; live-drift.sql replaces it if they differ.
create or replace function auth.uid() returns uuid
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create schema storage;
create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  owner uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
-- A stand-in with the columns the migrations' policies name, not checked
-- against live (see the top). Plan 2's storage fake (design A4) replaces it
-- with live's column list and protect_delete.
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  metadata jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[]
language plpgsql
as $function$
declare
  _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts,1)-1];
end
$function$;

create schema extensions;
create extension pgcrypto with schema extensions;

grant usage on schema public to anon, authenticated, service_role;
grant usage, create on schema public to pb_owner;
grant usage on schema auth to anon, authenticated, service_role, pb_owner;
grant usage on schema storage to anon, authenticated, service_role, pb_owner;
grant usage on schema extensions to anon, authenticated, service_role, pb_owner;
grant execute on function auth.uid() to anon, authenticated, service_role, pb_owner;
grant select, references on auth.users to pb_owner;
grant select, insert on storage.buckets to pb_owner;
grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
-- The migrations create and drop policies on storage.objects, which only its
-- owner may do. Live's owner is recorded in the capture (own|storage.objects).
alter table storage.objects owner to pb_owner;

-- Supabase's default grants on what the owner creates in public; without
-- them every authenticated query fails with 42501, which looks exactly like a
-- row level security refusal. Compared with live through the priv| rows.
alter default privileges for role pb_owner in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges for role pb_owner in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges for role pb_owner in schema public grant execute on functions to anon, authenticated, service_role;
