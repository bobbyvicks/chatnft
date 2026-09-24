-- The final project's status, stfp, was never an allowed value here.
--
-- The page has four statuses (STATUSES in index.html: approved, wip,
-- rejected, stfp) and this check allowed the first three, so every trait
-- marked for the final project was refused by the server with a 400
-- (a check violation) and the page said "the server refused it (400)".
-- Measured before the change: 384 rows, none with status stfp - every
-- attempt had been refused.
--
-- Checked at the same time that nothing else on the server reads a trait's
-- status: no function, no policy on public or storage, no trigger. The
-- storage path carries the status in its file name, and the storage
-- policies test only the team folder (is_team_path).
--
-- A widening: every existing row already satisfies it.
alter table public.traits drop constraint traits_status_check;
alter table public.traits add constraint traits_status_check
  check (status is null or status in ('wip','approved','rejected','stfp'));
