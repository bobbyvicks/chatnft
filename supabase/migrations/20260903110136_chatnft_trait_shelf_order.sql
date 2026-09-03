-- A shelf position belongs to a trait row, not to its PNG. Moving a card can
-- therefore remain a metadata-only update: no storage object is copied,
-- renamed, uploaded, or deleted.
alter table public.traits
  add column if not exists shelf_order bigint;

create index if not exists traits_collection_layer_shelf_order_idx
  on public.traits(collection_id, layer, shelf_order, id);

-- Reorder every affected layer in one transaction. SECURITY INVOKER is
-- deliberate: the existing traits_team and collections_team policies remain
-- the authority, instead of this function bypassing RLS.
create or replace function public.reorder_traits(p_collection uuid, p_items jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  team uuid;
  supplied integer;
  distinct_ids integer;
  matched integer;
begin
  if (select auth.uid()) is null then
    raise exception 'not signed in';
  end if;
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'invalid shelf order';
  end if;

  select c.team_id into team
    from public.collections c
   where c.id = p_collection;
  if team is null or not public.is_team_member(team) then
    raise exception 'not your project';
  end if;

  select count(*), count(distinct x.id)
    into supplied, distinct_ids
    from jsonb_to_recordset(p_items)
      as x(id uuid, layer text, shelf_order bigint);
  if supplied = 0 or supplied <> distinct_ids then
    raise exception 'invalid shelf order';
  end if;
  if exists (
    select 1
      from jsonb_to_recordset(p_items)
        as x(id uuid, layer text, shelf_order bigint)
     where x.id is null or nullif(btrim(x.layer), '') is null
        or x.shelf_order is null
  ) then
    raise exception 'invalid shelf order';
  end if;

  select count(*) into matched
    from public.traits t
    join jsonb_to_recordset(p_items)
      as x(id uuid, layer text, shelf_order bigint)
      on x.id = t.id
   where t.collection_id = p_collection and t.team_id = team;
  if matched <> supplied then
    raise exception 'trait outside project';
  end if;

  update public.traits t
     set layer = x.layer,
         shelf_order = x.shelf_order
    from jsonb_to_recordset(p_items)
      as x(id uuid, layer text, shelf_order bigint)
   where t.id = x.id
     and t.collection_id = p_collection
     and t.team_id = team;

  update public.collections
     set updated_at = now()
   where id = p_collection and team_id = team;
end;
$$;

revoke all on function public.reorder_traits(uuid, jsonb) from public, anon;
grant execute on function public.reorder_traits(uuid, jsonb) to authenticated;
