-- Room to make a one-of-one.
--
-- The weight column capped the spread within a set at 99:2, so the neutral
-- weight -- the point whose ratio to each end is equal, sqrt(2*99) -- was 14,
-- and one drag of the Plan rarity slider from a levelled set reached only 7x
-- rarer than an even share: 0.46% of characters on a 21-trait layer, 0.22% on
-- a 43-trait one. A trait at 0.1% was not expressible at any setting.
--
-- At 5000 the neutral is sqrt(2*5000) = 100 and one drag is 50x:
-- 0.065% on eyes, 0.031% on backgrounds. Weight 1 keeps its meaning as the
-- column default and the flag for "nobody has set a rarity yet", which is what
-- the section counts to say a project is not finished.
--
-- Safe on the data by construction: this only WIDENS the accepted range, so no
-- stored row can violate it. Measured before applying -- all 288 rows sat at 1,
-- the default -- so there were no planned shares to preserve and nothing to
-- rescale. Had any been planned, they would have needed scaling by the same
-- factor together, since a share is a ratio and only a uniform rescale leaves
-- every one of them unchanged.
--
-- Verified after, from the live catalog rather than from this file: exactly one
-- rarity check remains and it reads 1..5000; the column is still a plain
-- integer, not null, default 1; the traits_team policy is untouched; the only
-- trigger on the table is traits_touch, which does not mention rarity; and
-- there are no rewrite rules. So nothing else enforces the old bound.
alter table public.traits
  drop constraint traits_rarity_check,
  add constraint traits_rarity_check check (rarity >= 1 and rarity <= 5000);
