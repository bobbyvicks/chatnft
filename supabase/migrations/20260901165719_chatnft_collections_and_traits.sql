-- ChatNFT: a saved collection belongs to one signed-in person.
--
-- The version in this filename matches the row already in
-- supabase_migrations.schema_migrations, so the Git integration treats this as
-- applied and skips it. A different timestamp would make it try to create these
-- tables again, and fail.

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  name text not null default 'My collection',
  -- The layer draw order, stored whole. Order IS the data here, and a separate
  -- table would need a position column kept in step on every reorder.
  layers jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index collections_owner_idx on public.collections(owner);

create table public.traits (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections(id) on delete cascade,
  -- Denormalised from collections on purpose: it makes every RLS check a
  -- single-column comparison instead of a join on every row read.
  owner uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('trait','ref')),
  name text not null,
  layer text,
  status text check (status is null or status in ('wip','approved','rejected')),
  rarity integer not null default 1 check (rarity between 1 and 99),
  w integer not null check (w > 0),
  h integer not null check (h > 0),
  -- Object path in the private 'traits' bucket. The image itself is never in
  -- the row: base64 in Postgres would make every listing drag the art with it.
  path text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index traits_collection_idx on public.traits(collection_id);
create index traits_owner_idx on public.traits(owner);

-- Mirrors the identity the browser already uses (name + layer + status), so a
-- sync is an upsert rather than a diff. coalesce because a reference has no
-- layer or status and NULLs would not collide in a plain unique index.
create unique index traits_identity_idx on public.traits
  (collection_id, kind, name, coalesce(layer,''), coalesce(status,''));

-- updated_at is set by the SERVER, never accepted from the client. A timestamp
-- the client asserts is worthless for deciding which side of a sync is newer,
-- which is the one job it has here.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger collections_touch before update on public.collections
  for each row execute function public.touch_updated_at();
create trigger traits_touch before update on public.traits
  for each row execute function public.touch_updated_at();

alter table public.collections enable row level security;
alter table public.traits enable row level security;

-- One policy each, covering every command. `to authenticated` matters: without
-- it the policy is also offered to the anon role, and a with-check that reads
-- auth.uid() as NULL is not a guard.
create policy collections_own on public.collections
  for all to authenticated
  using (owner = (select auth.uid()))
  with check (owner = (select auth.uid()));

create policy traits_own on public.traits
  for all to authenticated
  using (owner = (select auth.uid()))
  with check (owner = (select auth.uid()));
