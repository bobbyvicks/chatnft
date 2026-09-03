# Shared Trait Shelf Organization

Date: 2026-09-03
Status: Approved design

## Purpose

Improve the **Your project** trait shelf that appears after a submitted image is saved as a trait. Users must be able to temporarily hide or isolate trait cards, drag cards into a preferred order, and drag cards between layer sections. In a shared team project, invitees must receive the saved arrangement when they next load or refresh the project.

This feature changes the project shelf only. It does not add visibility controls or free-position dragging to the character builder or pixel editor.

## User experience

### Card controls

Each trait card receives three shelf-specific controls:

- A dedicated drag handle. Dragging starts only from this handle, so clicking the artwork continues to open the trait editor.
- A visibility button that hides the card for the current browser session.
- An isolate button that hides every other trait card in the shelf for the current browser session.

The project header displays **Show hidden (n)** whenever one or more cards are hidden. Enabling it renders hidden cards in a visibly dimmed state so their visibility buttons can restore them. A **Show all** action clears all temporary hiding and isolation.

Visibility state is memory-only. It is not written to IndexedDB, Supabase, project exports, generated sheets, randomization, or trait records. Reloading the page restores every card. Invitees do not see another user's temporary hidden state.

### Pointer dragging

The implementation uses Pointer Events rather than native HTML drag-and-drop so the same interaction works with mouse, pen, and touch.

While dragging:

- The dragged card is represented by a lightweight drag preview.
- A clear insertion marker identifies the exact destination between cards.
- Layer card areas and empty layer sections are valid drop targets.
- The shelf scrolls automatically when the pointer approaches its top or bottom edge.
- Dropping between cards in the same layer changes the card order.
- Dropping in another layer changes both the card's layer and its position in that layer.
- Dropping outside a valid destination makes no change.
- Pressing Escape cancels the active drag.

Temporary hiding and the existing search/status filters do not change the authoritative full order. A drag is resolved against the visible destination card in that full order: dropping before or after a visible card inserts immediately before or after that record, while non-visible records keep their relative order. During an active drag, every layer header remains available as a drop target even when all of its cards are currently filtered or hidden.

### Keyboard dragging

The drag handle is keyboard focusable. Space or Enter picks up the card, arrow keys move the proposed destination, Enter drops, and Escape cancels. A live region announces pickup, destination layer and position, save success, cancellation, and failure. Existing card controls remain independently focusable.

## Ordering model

### Trait records

Add an optional `shelf_order` integer to `public.traits`. Browser trait records expose the same value as `shelfOrder`.

Order is scoped to a layer. Lower values render earlier within that layer. The client writes normalized values in fixed increments, leaving room for future insertion strategies while keeping comparisons simple.

Existing traits without an order retain today's newest-first order through an `at` fallback. The first successful rearrangement normalizes all traits in the affected source and destination layers. This migration does not alter artwork, names, statuses, rarities, timestamps, or storage objects.

A newly saved, bulk-image-imported, or duplicated trait is placed at the start of its layer, matching today's newest-first shelf behavior. When a layer already has explicit order values, the new record receives a value before the current minimum. When a layer contains only legacy records, the new explicit record renders before the legacy group; the first later rearrangement normalizes the whole layer. Importing a version 2 project backup preserves the explicit order stored in that backup; version 1 backups use the legacy fallback.

The shelf render order is:

1. Records with `shelfOrder`, ascending.
2. Legacy records without `shelfOrder`, ordered by existing `at` newest-first behavior after the explicit group.
3. Record ID as a deterministic final tie-breaker within otherwise equal records.

### Local records

For a personal project with no active shared workspace, a successful drop updates IndexedDB immediately. Reordering changes only `shelfOrder`. A cross-layer move deletes the old local ID and writes the new layer-encoded local ID while retaining every other trait property.

Project export format version 2 includes optional `shelfOrder`. Import accepts both version 1 and version 2. Version 1 records use the legacy fallback until rearranged. Export/import never includes temporary visibility state.

### Shared team records

Add an authenticated Supabase RPC that accepts a collection ID and the complete normalized order for the affected layers. The RPC:

1. Verifies that the authenticated user belongs to the collection's team.
2. Verifies that every supplied trait belongs to the collection.
3. Updates `layer` and `shelf_order` in one database transaction.
4. Updates the collection timestamp so a later load detects the change.
5. Rejects the entire operation if a destination-layer identity conflict would violate the existing name/layer/status uniqueness rule.

The RPC updates database metadata only. A trait's PNG storage path is treated as an opaque object location and is left unchanged, so reorganizing a shelf never uploads, copies, rewrites, or deletes artwork. The stable Supabase row ID remains unchanged when a card moves between layers.

Cloud push and pull include `shelf_order`. After a pull, local records retain their Supabase `rowId`, enabling subsequent reorders to address the stable shared record even when the browser's layer-encoded local ID changes.

No realtime subscription is added. Invitees receive the saved arrangement on their next explicit cloud load or page refresh. Concurrent rearrangements use last-write-wins at the affected-layer level.

## Save and failure behavior

The browser captures the source and destination layer arrays before applying a drop. It renders the proposed order optimistically and marks the affected handles as saving.

- For local-only projects, IndexedDB success completes the operation.
- For shared projects, the atomic RPC must succeed before the new local arrangement is considered saved.
- If the RPC or local write fails, the browser restores the captured arrays and local records, rerenders the previous arrangement, and reports that invitees will not see the attempted move.
- A uniqueness conflict reports that the destination already contains a trait with the same name and status. Nothing is renamed or overwritten automatically.
- Repeated input is ignored while the affected layers are saving.

Temporary visibility state follows a trait through a successful move during the current session. A stable `rowId` is used when available; local-only moves transfer the visibility key from the old local ID to the new one.

## Components and files

### `index.html`

- Render drag, hide, and isolate controls on shelf cards.
- Maintain the session-only hidden-record set and header controls.
- Add pointer and keyboard drag orchestration, insertion indicators, announcements, and auto-scroll.
- Sort shelf cards by the new ordering model.
- Include `shelfOrder` in IndexedDB, cloud push/pull, and project export/import flows.
- Call the shared reorder RPC and roll back optimistic state on failure.

### Pure interaction helper

Add a small browser/Node-compatible helper module for deterministic operations:

- Resolve legacy and explicit shelf ordering.
- Move a record before or after a target in the full unfiltered order.
- Move a record across layers.
- Normalize affected layer order values.
- Transfer temporary visibility keys after a local cross-layer move.

Keeping these operations outside DOM event handlers makes filtered, hidden, and cross-layer cases directly testable.

### Supabase migration

- Add nullable `shelf_order` to `public.traits` with an index supporting collection/layer/order reads.
- Add the authenticated atomic reorder RPC and team-membership checks.
- Preserve existing policies, uniqueness constraints, and storage layout.

### Tests

Add unit and integration coverage for:

- Explicit and legacy ordering.
- Same-layer reorder.
- Cross-layer moves and local ID changes.
- Preservation of PNG bytes, name, status, rarity, dimensions, and timestamps.
- Hidden and filtered records retaining relative order.
- Hide, isolate, reveal, show-all, and refresh reset behavior.
- Pointer cancellation, invalid drops, and auto-scroll boundaries.
- Keyboard pickup, movement, drop, cancellation, and announcements.
- Shared RPC payloads, refresh/load reconstruction, rollback, uniqueness conflicts, and authorization failure.
- Version 1 and version 2 project import/export compatibility.

Run the complete existing test suite after the focused tests. Verify the shelf manually with mouse, touch emulation, and keyboard in a Vercel preview before production deployment.

## Deployment sequence

1. Run local unit and integration tests.
2. Apply the additive Supabase migration.
3. Deploy a Vercel preview and verify local and shared-team shelves.
4. Have the user approve the preview.
5. Promote the verified build to production.

The frontend must continue to render legacy rows with no `shelf_order`, allowing the additive migration and frontend release to be deployed without rewriting existing traits.

## Non-goals

- Repositioning trait pixels on a canvas.
- Reordering character-builder layers.
- Sharing temporary hidden/isolate state.
- Live multi-user updates or drag presence.
- A reorder history or conflict-resolution interface.
- Rewriting PNG storage paths when a trait changes layers.
