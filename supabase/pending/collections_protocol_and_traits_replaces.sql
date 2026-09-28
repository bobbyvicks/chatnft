-- Change A0 of the auto cloud save design (A8): three columns, nothing else.
--
--   collections.protocol      smallint, not null, default 1, check protocol = 1
--   collections.switching_at  timestamptz, nullable, check switching_at is null
--   traits.replaces           uuid, nullable, no default, no foreign key, no index
--
-- protocol is NOT NULL as well as checked: a check passes a null, and the
-- collections_team policy lets any member write any column, so without it a
-- member could set protocol to null, which a later page would read as "not
-- 1". The two checks keep every project on protocol 1 and not switching until
-- Change A drops them by these names and installs its pin. replaces has no
-- foreign key because the row it names is deleted by the very save that sends
-- it (index.html cloudSyncOne: delete, then insert).
--
-- Today's page is untouched: every write it makes names its columns, and the
-- defaults satisfy both checks. test/sql/a0.test.mjs replays each of those
-- writes after this file.
--
-- DO NOT RUN THIS FILE AS ONE QUERY. Sent whole, the two statements may run
-- as one transaction, holding traits while waiting for collections - the
-- thing the split below exists to avoid. Send each DO statement on its own,
-- through the connector or in the SQL editor, statement 1 first.
--
-- HOW IT IS APPLIED (design A8). Two statements, each its own transaction,
-- one after the other, in a window the team was told about. Each sets
-- lock_timeout to 3s for its own transaction only - set_config(..., true) is
-- SET LOCAL, so it cannot outlive the statement on a pooled connection - and
-- is run again on 55P03 (lock timeout) or 40P01 (deadlock). One table per
-- transaction, so neither ever holds one table while waiting for the other.
-- Each skips its ALTER when its columns are already there, so running it
-- again - by a person, or by anything that replays this folder - takes no
-- lock at all.
--
-- The owner approved this exact file; its sha256, who ran it, the read-backs
-- before and after, and the window are in the commit that renamed it from
-- supabase/pending into supabase/migrations. Never dropped (design A8, E1).

do $a0_traits$
begin
  perform set_config('lock_timeout', '3s', true);
  if not exists (
    select 1 from pg_catalog.pg_attribute
     where attrelid = 'public.traits'::regclass and attname = 'replaces' and not attisdropped
  ) then
    alter table public.traits add column replaces uuid;
  end if;
end
$a0_traits$;

do $a0_collections$
begin
  perform set_config('lock_timeout', '3s', true);
  if (select count(*) from pg_catalog.pg_attribute
       where attrelid = 'public.collections'::regclass
         and attname in ('protocol', 'switching_at') and not attisdropped) < 2 then
    alter table public.collections
      add column if not exists protocol smallint not null default 1
        constraint collections_protocol_check check (protocol = 1),
      add column if not exists switching_at timestamptz
        constraint collections_switching_at_check check (switching_at is null);
  end if;
end
$a0_collections$;
