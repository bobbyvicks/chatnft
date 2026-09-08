-- How often a layer is left empty is a decision about the collection, not
-- about a browser, and it had nowhere shared to live.
--
-- Every "of characters" figure in the app is scaled by it: traitChance
-- multiplies by 1-emptyChance for any layer that is not always present. Until
-- this column existed, cloudPush sent traits and refs only and collections had
-- no field for it, so two people on one project read different percentages for
-- the same trait - on a shared mint, two people planning against two different
-- collections.
--
-- The bounds match the client's own clamp exactly, so a value the page would
-- refuse cannot be stored by any other route either. NOT NULL with a default,
-- because a null here is not "no opinion" - it is a value the client would
-- have to interpret, and Number(null) is 0, which is a perfectly legal empty
-- chance meaning every optional layer appears on every character. The client
-- refuses anything that is not already a number for the same reason; this
-- makes sure it never has to.
--
-- Additive and idempotent: no existing row can violate it and re-running it
-- changes nothing.
--
-- Verified after applying, from the live catalog: real, not null, default
-- 0.35, check 0..0.9, the collections_team policy untouched, and the one
-- existing collection sitting at the default.
alter table public.collections
  add column if not exists empty_chance real not null default 0.35
  check (empty_chance >= 0 and empty_chance <= 0.9);
