# Shared Trait Shelf Organization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add temporary hide/isolate controls and persistent drag-and-drop ordering across and within the **Your project** trait shelf, with refresh-based synchronization for team invitees.

**Architecture:** A new pure `trait-shelf-core.js` module owns deterministic order, cross-layer move, legacy fallback, and normalization logic. `index.html` owns shelf rendering and pointer/keyboard orchestration, while an additive Supabase column and authenticated RPC persist shared ordering atomically without moving PNG objects. Temporary visibility remains memory-only.

**Tech Stack:** Static HTML/CSS/JavaScript, Pointer Events, IndexedDB, Node.js built-in test runner, Supabase Postgres/PostgREST, Vercel static deployment.

**Spec:** `docs/superpowers/specs/2026-09-03-trait-shelf-organization-design.md`

## Global Constraints

- The feature applies to the **Your project** trait shelf only, not the character builder or pixel editor.
- Temporary hide/isolate state must never enter IndexedDB, Supabase, project exports, randomization, sheets, or generated downloads.
- Shared order changes appear to invitees on their next load or refresh; no realtime subscription is added.
- Reordering must never modify, upload, copy, delete, or re-encode trait PNG bytes.
- Shared cross-layer moves keep the stable Supabase row ID and opaque storage path.
- Existing traits with no order retain newest-first behavior until an affected layer is normalized.
- Destination identity conflicts must reject the whole move; never overwrite or rename automatically.
- Pointer interaction must work with mouse, pen, and touch; keyboard pickup/drop and cancellation remain available.
- Preserve all pre-existing uncommitted workspace changes and never stage unrelated hunks.

---

### Task 1: Pure shelf ordering engine

**Files:**
- Create: `trait-shelf-core.js`
- Create: `test/trait-shelf-core.test.mjs`

**Interfaces:**
- Consumes: plain trait records shaped as `{id, rowId?, kind, name, layer, status?, shelfOrder?, at?, ...metadata}`.
- Produces: `globalThis.ChatNftTraitShelf` with:
  - `ORDER_STEP: 1024`
  - `recordKey(record) -> string`
  - `compareShelfRecords(a, b) -> number`
  - `orderedLayer(records, layer) -> TraitRecord[]`
  - `nextShelfOrder(records, layer) -> number`
  - `planShelfMove(records, {recordKey, toLayer, beforeKey?}) -> {ok, reason?, sourceLayer?, destinationLayer?, updates?}`
- `updates` is an array of `{oldId, oldKey, record}`. `record` is a full cloned trait record with normalized `shelfOrder`; a moved local record also has its new layer-encoded `id`.

- [ ] **Step 1: Write failing ordering tests**

Create `test/trait-shelf-core.test.mjs` with tests equivalent to:

```js
import test from "node:test";
import assert from "node:assert/strict";

await import("../trait-shelf-core.js").catch(() => {});
const shelf = globalThis.ChatNftTraitShelf;
const trait = (id, layer, at, extra = {}) => ({
  id, kind: "trait", name: id, layer, status: "wip", at, blob: { id }, ...extra,
});

test("orders explicit records before legacy records and keeps legacy newest-first", () => {
  assert.equal(typeof shelf?.orderedLayer, "function");
  const records = [
    trait("old", "hats", 1),
    trait("new", "hats", 2),
    trait("ordered-b", "hats", 3, { shelfOrder: 2048 }),
    trait("ordered-a", "hats", 4, { shelfOrder: 1024 }),
  ];
  assert.deepEqual(shelf.orderedLayer(records, "hats").map(r => r.id),
    ["ordered-a", "ordered-b", "new", "old"]);
});

test("puts a newly saved trait before the current explicit order", () => {
  const records = [trait("a", "hats", 1, { shelfOrder: 1024 })];
  assert.equal(shelf.nextShelfOrder(records, "hats"), 0);
  assert.equal(shelf.nextShelfOrder([trait("legacy", "hats", 1)], "hats"), 0);
});
```

- [ ] **Step 2: Run tests and verify the red state**

Run: `node --test test/trait-shelf-core.test.mjs`

Expected: FAIL because `ChatNftTraitShelf` and its methods do not exist.

- [ ] **Step 3: Implement the module wrapper and ordering primitives**

Create `trait-shelf-core.js` using the repository's existing browser/Node IIFE convention:

```js
(function (root) {
  "use strict";
  const ORDER_STEP = 1024;
  const explicit = value => Number.isFinite(Number(value));
  const recordKey = record => String(record?.rowId || record?.id || "");

  function compareShelfRecords(a, b) {
    const ae = explicit(a?.shelfOrder), be = explicit(b?.shelfOrder);
    if (ae !== be) return ae ? -1 : 1;
    if (ae && Number(a.shelfOrder) !== Number(b.shelfOrder)) {
      return Number(a.shelfOrder) - Number(b.shelfOrder);
    }
    if (!ae && Number(a?.at || 0) !== Number(b?.at || 0)) {
      return Number(b?.at || 0) - Number(a?.at || 0);
    }
    return recordKey(a).localeCompare(recordKey(b));
  }

  function orderedLayer(records, layer) {
    return records.filter(r => r?.kind === "trait" && r.layer === layer)
      .slice().sort(compareShelfRecords);
  }

  function nextShelfOrder(records, layer) {
    const explicitOrders = orderedLayer(records, layer)
      .filter(r => explicit(r.shelfOrder)).map(r => Number(r.shelfOrder));
    return explicitOrders.length ? Math.min(...explicitOrders) - ORDER_STEP : 0;
  }

  root.ChatNftTraitShelf = Object.freeze({
    ORDER_STEP, recordKey, compareShelfRecords, orderedLayer, nextShelfOrder,
  });
})(typeof window === "object" ? window : globalThis);
```

- [ ] **Step 4: Run ordering tests and verify green**

Run: `node --test test/trait-shelf-core.test.mjs`

Expected: both ordering tests PASS.

- [ ] **Step 5: Add failing move-plan tests**

Extend `test/trait-shelf-core.test.mjs` with explicit same-layer, cross-layer, hidden-neighbor, metadata-preservation, stable-row-key, and collision cases:

```js
test("reorders against the full layer order even when the destination came from a filtered view", () => {
  const records = [
    trait("a", "hats", 3, { shelfOrder: 1024 }),
    trait("hidden", "hats", 2, { shelfOrder: 2048 }),
    trait("c", "hats", 1, { shelfOrder: 3072 }),
  ];
  const plan = shelf.planShelfMove(records, {
    recordKey: "c", toLayer: "hats", beforeKey: "a",
  });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.updates.map(update => update.record.id), ["c", "a", "hidden"]);
  assert.deepEqual(plan.updates.map(update => update.record.shelfOrder), [1024, 2048, 3072]);
});

test("moves across layers without changing metadata or blob identity", () => {
  const source = trait("t_hat_hats_wip", "hats", 10, {
    name: "hat", rarity: 7, rowId: "row-1", blob: { bytes: "same" }, w: 128, h: 128,
  });
  const target = trait("shirt", "clothing", 5, { shelfOrder: 1024 });
  const plan = shelf.planShelfMove([source, target], {
    recordKey: "row-1", toLayer: "clothing", beforeKey: "shirt",
  });
  const moved = plan.updates.find(update => update.oldKey === "row-1").record;
  assert.equal(moved.id, "t_hat_clothing_wip");
  assert.equal(moved.rowId, "row-1");
  assert.equal(moved.blob, source.blob);
  assert.equal(moved.rarity, 7);
  assert.equal(moved.w, 128);
  assert.equal(moved.h, 128);
});

test("rejects a destination identity conflict without producing updates", () => {
  const moving = trait("t_hat_hats_wip", "hats", 2, { name: "hat" });
  const duplicate = trait("t_hat_clothing_wip", "clothing", 1, { name: "hat" });
  assert.deepEqual(shelf.planShelfMove([moving, duplicate], {
    recordKey: moving.id, toLayer: "clothing",
  }), { ok: false, reason: "duplicate" });
});
```

- [ ] **Step 6: Run move-plan tests and verify they fail**

Run: `node --test test/trait-shelf-core.test.mjs`

Expected: FAIL because `planShelfMove` is undefined.

- [ ] **Step 7: Implement deterministic move planning**

Add helpers that:

1. Resolve the source record using `recordKey`.
2. Reject missing sources, invalid layers, and another destination record with the same `name` and `status`.
3. Remove the source from its full sorted source layer.
4. Insert it before `beforeKey`, or at the destination end when `beforeKey` is absent.
5. Normalize source and destination orders to `ORDER_STEP * (index + 1)`.
6. Build the moved local ID as `t_${name}_${toLayer}_${status || "wip"}` while preserving `rowId`, `blob`, and all metadata.
7. Return updates in final display order for the affected source layer followed by the destination layer, without duplicating a same-layer update.

Export `planShelfMove` on `ChatNftTraitShelf`.

- [ ] **Step 8: Run the focused suite**

Run: `node --test test/trait-shelf-core.test.mjs`

Expected: all shelf-core tests PASS.

- [ ] **Step 9: Commit clean new files only**

```bash
git add trait-shelf-core.js test/trait-shelf-core.test.mjs
git commit -m "feat: add deterministic trait shelf ordering"
```

Do not stage any pre-existing modified file.

---

### Task 2: Persist shelf order locally and in shared projects

**Files:**
- Create: `supabase/migrations/20260903HHMMSS_chatnft_trait_shelf_order.sql` using the actual UTC timestamp at implementation time
- Create: `test/trait-shelf-persistence.test.mjs`
- Modify: `index.html` at script includes, `duplicateTrait`, `renderShelf`, `saveTrait`, bulk import, project export/import, `cloudSyncOne`, and `cloudPull`

**Interfaces:**
- Consumes: `ChatNftTraitShelf.nextShelfOrder`, `compareShelfRecords`, and move-plan update records from Task 1.
- Produces:
  - Supabase column `public.traits.shelf_order bigint null`
  - RPC `public.reorder_traits(p_collection uuid, p_items jsonb) returns void`
  - Browser record property `shelfOrder`
  - `PROJECT_VERSION = 2`, while continuing to import version 1

- [ ] **Step 1: Write failing persistence and wiring tests**

Create `test/trait-shelf-persistence.test.mjs` that reads `index.html` and the new migration and asserts:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const migrations = new URL("../supabase/migrations/", import.meta.url);

test("loads the shelf core before inline application code", () => {
  assert.match(html, /<script src="\.\/trait-shelf-core\.js"><\/script>/);
  assert.match(html, /ChatNftTraitShelf\.nextShelfOrder/);
  assert.match(html, /\.sort\(shelfCore\.compareShelfRecords\)/);
});

test("round-trips optional shelf order through project version 2", () => {
  assert.match(html, /const PROJECT_VERSION=2/);
  assert.match(html, /shelfOrder:.*it\.shelfOrder/);
  assert.match(html, /typeof it\.shelfOrder===['"]number['"]/);
});

test("syncs shelf order without changing the stored PNG path", () => {
  assert.match(html, /shelf_order:.*rec\.shelfOrder/);
  assert.match(html, /shelf_order/);
  assert.match(html, /function cloudSaveShelfPlan|async function cloudSaveShelfPlan/);
});
```

Use `readdir` to locate the migration filename, then assert that its SQL contains `add column if not exists shelf_order bigint`, the collection/layer/order index, `reorder_traits`, `auth.uid()`, `is_team_member`, `jsonb_to_recordset`, and execute privileges for `authenticated` only.

- [ ] **Step 2: Run persistence tests and verify red**

Run: `node --test test/trait-shelf-persistence.test.mjs`

Expected: FAIL because the script include, order data flow, migration, and RPC do not exist.

- [ ] **Step 3: Add the additive Supabase migration**

Create the timestamped SQL migration with this contract:

```sql
alter table public.traits
  add column if not exists shelf_order bigint;

create index if not exists traits_collection_layer_shelf_order_idx
  on public.traits(collection_id, layer, shelf_order, id);

create or replace function public.reorder_traits(p_collection uuid, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  team uuid;
  supplied integer;
  matched integer;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'invalid shelf order'; end if;

  select c.team_id into team from public.collections c where c.id = p_collection;
  if team is null or not public.is_team_member(team) then raise exception 'not your project'; end if;

  select count(*), count(distinct x.id) into supplied, matched
  from jsonb_to_recordset(p_items) as x(id uuid, layer text, shelf_order bigint);
  if supplied <> matched then raise exception 'duplicate trait id'; end if;

  select count(*) into matched
  from public.traits t
  join jsonb_to_recordset(p_items) as x(id uuid, layer text, shelf_order bigint)
    on x.id = t.id
  where t.collection_id = p_collection and t.team_id = team;
  if matched <> supplied then raise exception 'trait outside project'; end if;

  update public.traits t
     set layer = x.layer, shelf_order = x.shelf_order
    from jsonb_to_recordset(p_items) as x(id uuid, layer text, shelf_order bigint)
   where t.id = x.id and t.collection_id = p_collection and t.team_id = team;

  update public.collections set updated_at = now() where id = p_collection;
end $$;

revoke all on function public.reorder_traits(uuid, jsonb) from public, anon;
grant execute on function public.reorder_traits(uuid, jsonb) to authenticated;
```

Postgres uniqueness enforcement provides atomic destination-conflict rejection. Do not update `path`, `name`, `status`, `rarity`, dimensions, or ownership.

- [ ] **Step 4: Wire local creation, ordering, export, and import**

In `index.html`:

- Load `trait-shelf-core.js` before the inline application script and bind `const shelfCore=window.ChatNftTraitShelf`.
- Add `shelfOrder:shelfCore.nextShelfOrder(existingTraits, layer)` to newly saved, duplicated, and bulk-image-imported trait records. A version 2 project-backup import preserves its numeric `shelfOrder`; a version 1 backup uses the legacy fallback.
- Replace `mine.sort((a,b)=>b.at-a.at)` in the shelf with `.sort(shelfCore.compareShelfRecords)`.
- Change `PROJECT_VERSION` to `2`.
- Export `shelfOrder` only when it is numeric.
- Import version 1 and 2, copying numeric `shelfOrder`; reject versions above 2.

Do not add temporary visibility state to any persistence path.

- [ ] **Step 5: Wire cloud push and pull**

- Include `shelf_order:(typeof rec.shelfOrder === "number" ? rec.shelfOrder : null)` in `cloudSyncOne`.
- Add `shelf_order` to the cloud pull `select` list.
- Convert numeric `row.shelf_order` to local `rec.shelfOrder` without changing `rowId` or `path`.
- Add `async function cloudSaveShelfPlan(collection, updates)` that posts `{p_collection: collection.id, p_items: updates.map(...)}` to `/rest/v1/rpc/reorder_traits` with authenticated JSON headers. Its items contain only stable `rowId`, destination `layer`, and numeric `shelfOrder`.
- Return `{ok:false, reason}` for HTTP failures so the UI can roll back and distinguish a `409` uniqueness conflict.

- [ ] **Step 6: Run persistence tests**

Run: `node --test test/trait-shelf-persistence.test.mjs test/trait-shelf-core.test.mjs`

Expected: PASS.

- [ ] **Step 7: Inspect the diff for accidental persistence**

Run:

```bash
rg -n "hidden|isolate|shelfHidden" index.html supabase/migrations/*trait_shelf_order.sql
git diff --check
```

Expected: no temporary visibility field in database, export, import, or cloud payload code; no whitespace errors.

- [ ] **Step 8: Commit only isolatable paths**

```bash
git add supabase/migrations/*trait_shelf_order.sql test/trait-shelf-persistence.test.mjs trait-shelf-core.js
git commit -m "feat: persist shared trait shelf order"
```

Do not stage `index.html` if it still contains pre-existing uncommitted work; leave its verified integration diff unstaged and report that fact.

---

### Task 3: Temporary hide and isolate controls

**Files:**
- Create: `test/trait-shelf-visibility.test.mjs`
- Modify: `index.html` shelf header markup, shelf CSS, `renderShelf`, and shelf state

**Interfaces:**
- Consumes: stable `shelfCore.recordKey(record)` values from Task 1.
- Produces:
  - `const shelfHidden = new Set()`
  - `let shelfRevealHidden = false`
  - `hideShelfTrait(record)`, `isolateShelfTrait(record, traits)`, `showAllShelfTraits()`, and `syncShelfVisibilityControls()`
  - Static controls `#shelfhidden` and `#shelfshowall`

- [ ] **Step 1: Write failing visibility integration tests**

Create `test/trait-shelf-visibility.test.mjs` that reads `index.html` and asserts:

```js
assert.match(html, /id="shelfhidden"/);
assert.match(html, /id="shelfshowall"/);
assert.match(html, /const shelfHidden=new Set\(\)/);
assert.match(html, /function hideShelfTrait\(/);
assert.match(html, /function isolateShelfTrait\(/);
assert.match(html, /function showAllShelfTraits\(/);
assert.match(html, /aria-label.*Hide/);
assert.match(html, /aria-label.*Isolate/);
assert.match(html, /classList\.toggle\(['"]shelf-hidden['"]/);
```

Also assert that no project export object or cloud JSON body contains `shelfHidden`.

- [ ] **Step 2: Run visibility tests and verify red**

Run: `node --test test/trait-shelf-visibility.test.mjs`

Expected: FAIL because no controls or session visibility state exist.

- [ ] **Step 3: Add header controls and accessible styles**

Add hidden-by-default **Show hidden (0)** and **Show all** buttons to the **Your project** actions. Add styles for card action controls, `.shelf-hidden` dimming, focus-visible treatment, and a compact action layout that does not cover the card name/status.

Do not use the native `hidden` attribute on individual hidden cards while reveal mode is on; they must remain focusable for restoration.

- [ ] **Step 4: Implement memory-only visibility behavior**

- Use `shelfCore.recordKey` for session keys.
- Normal shelf rendering excludes keys in `shelfHidden`.
- Reveal mode renders them with `.shelf-hidden` and an **Unhide** label.
- Hide adds one key and rerenders.
- Isolate replaces the set with every other trait key from the unfiltered project records and rerenders.
- Show all clears the set, exits reveal mode, and rerenders.
- Show hidden toggles reveal mode without changing the set.
- Search and status filtering remain independent from visibility.

Every dynamically created control must stop propagation so it never opens the trait editor.

- [ ] **Step 5: Run visibility and existing UI tests**

Run: `node --test test/trait-shelf-visibility.test.mjs test/ui-integration.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit the clean test file; preserve dirty integration state**

```bash
git add test/trait-shelf-visibility.test.mjs
git commit -m "test: cover temporary trait shelf visibility"
```

Leave `index.html` unstaged if staging it would include pre-existing edits.

---

### Task 4: Pointer and keyboard card dragging with atomic shared saving

**Files:**
- Create: `test/trait-shelf-drag.test.mjs`
- Modify: `index.html` shelf rendering, drag state, shared save, IndexedDB update, CSS, and live-region markup

**Interfaces:**
- Consumes: `shelfCore.planShelfMove(records, move)` and `cloudSaveShelfPlan(collection, updates)`.
- Produces:
  - `beginShelfDrag(record, handle, event?)`
  - `updateShelfDropTarget(targetLayer, beforeKey)`
  - `cancelShelfDrag(message?)`
  - `commitShelfDrop()`
  - `applyLocalShelfUpdates(updates)`
  - `rollbackLocalShelfUpdates(snapshot)`
  - `#shelflive` polite live region

- [ ] **Step 1: Write failing drag wiring tests**

Create `test/trait-shelf-drag.test.mjs` and assert that `index.html` contains:

```js
assert.match(html, /className=['"]shelfdrag['"]/);
assert.match(html, /addEventListener\(['"]pointerdown['"]/);
assert.match(html, /setPointerCapture/);
assert.match(html, /function beginShelfDrag\(/);
assert.match(html, /function updateShelfDropTarget\(/);
assert.match(html, /function commitShelfDrop\(/);
assert.match(html, /function cancelShelfDrag\(/);
assert.match(html, /shelfCore\.planShelfMove/);
assert.match(html, /cloudSaveShelfPlan/);
assert.match(html, /id="shelflive"/);
assert.match(html, /event\.key===['"]Escape['"]/);
```

Add assertions for `role="button"`, a descriptive drag-handle `aria-label`, saving/rollback messaging, and preservation of `blob`, `path`, `rarity`, `status`, `w`, and `h` via full-record cloning in the core tests.

- [ ] **Step 2: Run drag tests and verify red**

Run: `node --test test/trait-shelf-drag.test.mjs test/trait-shelf-core.test.mjs`

Expected: FAIL because drag orchestration does not exist.

- [ ] **Step 3: Render drag handles and drop metadata**

For every trait card:

- Add a focusable `.shelfdrag` button with `aria-label="Move ${name}"`.
- Set `data-shelf-key` on the card and `data-shelf-layer` on its layer wrapper.
- Add one reusable insertion marker and one lightweight drag preview to `document.body` only during an active drag.
- Keep card artwork click-to-open unchanged.

Layer headers remain rendered as drop targets during an active drag even if their cards are hidden or filtered.

- [ ] **Step 4: Implement pointer drag orchestration**

Use pointer capture on the handle. After a small movement threshold:

- Position the drag preview from pointer coordinates.
- Resolve the layer wrapper and nearest visible card using `document.elementFromPoint` and card bounds.
- Set `beforeKey` based on whether the pointer is above/left or below/right of the card midpoint.
- Show the insertion marker at that location.
- Auto-scroll the project/shelf viewport near its vertical boundaries using a bounded animation-frame loop.

On pointerup, call `commitShelfDrop`; on pointercancel, Escape, invalid destination, or lost capture, call `cancelShelfDrag`. Cancellation removes preview/marker state and changes no records.

- [ ] **Step 5: Implement keyboard drag orchestration**

- Space or Enter on a focused handle picks up its card.
- Up/Down move before or after adjacent cards in the current layer.
- Left/Right move between previous/next layer targets while retaining the closest valid index.
- Enter commits; Escape cancels.
- Announce pickup, candidate destination, saving, success, conflict, rollback, and cancellation through `#shelflive`.

- [ ] **Step 6: Implement local apply and rollback**

Before applying a valid plan, capture full clones of all updated local records and their old IDs.

- Apply each update by deleting `oldId` when it differs from `record.id`, then `dbPut(record)`.
- Transfer any temporary visibility key from `oldKey` to `shelfCore.recordKey(record)`.
- On any local failure, restore every captured record and remove every newly created ID.
- Disable drag handles for affected layers while saving.

For shared projects, optimistically apply local updates, call `cloudSaveShelfPlan`, and roll back locally if the RPC fails. For local-only projects, IndexedDB success completes the operation. Rerender the shelf after success or rollback.

- [ ] **Step 7: Add explicit conflict and failure messages**

- Core `reason:"duplicate"`: “That layer already has a trait with this name and status.”
- RPC 409: same conflict message and rollback.
- Authentication/authorization failure: “Could not save the shared order. Your previous layout was restored.”
- Network or IndexedDB failure: same rollback guarantee, without claiming invitees received the move.

- [ ] **Step 8: Run focused tests**

Run:

```bash
node --test test/trait-shelf-core.test.mjs test/trait-shelf-persistence.test.mjs test/trait-shelf-visibility.test.mjs test/trait-shelf-drag.test.mjs
```

Expected: PASS.

- [ ] **Step 9: Run the complete suite**

Run: `npm test`

Expected: all existing and new tests PASS.

- [ ] **Step 10: Review the integration diff**

Run:

```bash
git diff --check
git diff -- index.html
git status --short
```

Confirm that temporary visibility has no persistence path, PNG blobs/paths are never touched by the reorder RPC, and pre-existing edits remain present.

---

### Task 5: Apply the additive migration and verify a Vercel preview

**Files:**
- Verify: `supabase/migrations/*_chatnft_trait_shelf_order.sql`
- Verify: all files from Tasks 1-4

**Interfaces:**
- Consumes: passing local suite and authenticated Supabase/Vercel project access.
- Produces: migrated shared-team schema and a Vercel preview URL. Production remains unchanged until user approval.

- [ ] **Step 1: Re-run the full local quality gate**

Run:

```bash
npm test
git diff --check
```

Expected: tests PASS and no whitespace errors.

- [ ] **Step 2: Inspect the target Supabase project before mutation**

Using the Supabase connector, list accessible projects and match the project URL embedded in `index.html`. Confirm the project ID and inspect the current `traits` table/migration history. Do not guess a project ID.

- [ ] **Step 3: Apply the migration once**

Use the Supabase connector's migration operation with the exact SQL file from Task 2. Verify that:

- `public.traits.shelf_order` exists.
- `public.reorder_traits(uuid, jsonb)` exists.
- Anonymous execution is denied.
- Authenticated team members can execute it.
- Existing trait count and storage paths are unchanged.

- [ ] **Step 4: Start the local server and perform interaction verification**

Run: `npm run start:local`

In the browser, verify with a disposable or already-WIP trait set:

1. Hide one card, reveal hidden, restore it, isolate another, and show all.
2. Refresh and confirm all cards are visible.
3. Drag within a layer with mouse and touch emulation.
4. Drag between layers and confirm the PNG preview is byte-identical.
5. Perform keyboard pickup, destination change, drop, and Escape cancellation.
6. Load the shared project in a second session or after refresh and confirm the new order/layer.
7. Trigger an invalid duplicate destination and confirm rollback.

- [ ] **Step 5: Deploy a Vercel preview only**

Run from the linked `chatnft` directory:

```bash
npx --yes vercel@latest deploy --scope trellis67
```

Do not use `--prod`. Record the returned preview URL.

- [ ] **Step 6: Verify the preview**

Open the preview URL and repeat the shelf smoke path: hide/isolate/show-all, same-layer drag, cross-layer drag, refresh, and keyboard cancellation. Check console errors after each path.

- [ ] **Step 7: Report for production approval**

Provide the preview URL, test results, migration verification, files changed, and any pre-existing dirty files intentionally left uncommitted. Wait for explicit user approval before any production deployment.
