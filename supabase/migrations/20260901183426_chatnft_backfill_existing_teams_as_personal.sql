-- Teams created before the personal flag existed default to false, so my_team()
-- would not recognise them and would make each of those people a SECOND, empty
-- personal page - while the space holding their actual work quietly became a
-- "group project". Nobody would report that as a bug; it would just look like
-- their collection had vanished.
--
-- create_team() did not exist before this, so every team already in the
-- database was auto-created for one person. The conditions below say exactly
-- that, rather than assuming it: created by the only member, and that member is
-- its owner. A genuine group cannot match.
update public.teams t
   set personal = true,
       name = case when t.name = 'My team' then 'My page' else t.name end
 where t.personal = false
   and (select count(*) from public.team_members m where m.team_id = t.id) = 1
   and exists (
     select 1 from public.team_members m
      where m.team_id = t.id and m.user_id = t.created_by and m.role = 'owner'
   )
   -- and only where that person has no personal team yet, so this can never
   -- create a second one and trip the one-personal-each index
   and not exists (
     select 1
       from public.teams t2
       join public.team_members m2 on m2.team_id = t2.id
      where t2.personal and m2.user_id = t.created_by
   );