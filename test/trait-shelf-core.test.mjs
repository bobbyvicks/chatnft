import test from "node:test";
import assert from "node:assert/strict";

await import("../trait-shelf-core.js").catch(() => {});
const shelf = globalThis.ChatNftTraitShelf;

function trait(id, layer, at, extra = {}) {
  return {
    id,
    kind: "trait",
    name: id,
    layer,
    status: "wip",
    at,
    blob: { id },
    w: 128,
    h: 128,
    ...extra,
  };
}

test("orders explicit records before legacy records and keeps legacy records newest-first", () => {
  assert.equal(typeof shelf?.orderedLayer, "function");
  const records = [
    trait("old", "hats", 1),
    trait("new", "hats", 2),
    trait("ordered-b", "hats", 3, { shelfOrder: 2048 }),
    trait("ordered-a", "hats", 4, { shelfOrder: 1024 }),
  ];

  assert.deepEqual(
    shelf.orderedLayer(records, "hats").map(record => record.id),
    ["ordered-a", "ordered-b", "new", "old"],
  );
});

test("places a newly saved trait before the current explicit order", () => {
  assert.equal(typeof shelf?.nextShelfOrder, "function");
  assert.equal(
    shelf.nextShelfOrder([trait("a", "hats", 1, { shelfOrder: 1024 })], "hats"),
    0,
  );
  assert.equal(shelf.nextShelfOrder([trait("legacy", "hats", 1)], "hats"), 0);
});

test("uses the shared row id as the stable key when one exists", () => {
  assert.equal(typeof shelf?.recordKey, "function");
  assert.equal(shelf.recordKey(trait("local", "hats", 1, { rowId: "shared-row" })), "shared-row");
  assert.equal(shelf.recordKey(trait("local", "hats", 1)), "local");
});

test("reorders against the full layer even when an intermediate card is not visible", () => {
  assert.equal(typeof shelf?.planShelfMove, "function");
  const records = [
    trait("a", "hats", 3, { shelfOrder: 1024 }),
    trait("hidden", "hats", 2, { shelfOrder: 2048 }),
    trait("c", "hats", 1, { shelfOrder: 3072 }),
  ];

  const plan = shelf.planShelfMove(records, {
    recordKey: "c",
    toLayer: "hats",
    beforeKey: "a",
  });

  assert.equal(plan.ok, true);
  assert.deepEqual(plan.updates.map(update => update.record.id), ["c", "a", "hidden"]);
  assert.deepEqual(plan.updates.map(update => update.record.shelfOrder), [1024, 2048, 3072]);
});

test("moves across layers without changing artwork or trait metadata", () => {
  const sourceBlob = { bytes: "same-object" };
  const source = trait("t_hat_hats_wip", "hats", 10, {
    name: "hat",
    rarity: 7,
    rowId: "row-1",
    path: "opaque/original/path.png",
    blob: sourceBlob,
  });
  const target = trait("shirt", "clothing", 5, { shelfOrder: 1024 });

  const plan = shelf.planShelfMove([source, target], {
    recordKey: "row-1",
    toLayer: "clothing",
    beforeKey: "shirt",
  });

  assert.equal(plan.ok, true);
  const moved = plan.updates.find(update => update.oldKey === "row-1").record;
  assert.equal(moved.id, "t_hat_clothing_wip");
  assert.equal(moved.layer, "clothing");
  assert.equal(moved.rowId, "row-1");
  assert.equal(moved.path, "opaque/original/path.png");
  assert.equal(moved.blob, sourceBlob);
  assert.equal(moved.rarity, 7);
  assert.equal(moved.status, "wip");
  assert.equal(moved.w, 128);
  assert.equal(moved.h, 128);
});

test("rejects a destination identity conflict without producing updates", () => {
  const moving = trait("t_hat_hats_wip", "hats", 2, { name: "hat" });
  const duplicate = trait("t_hat_clothing_wip", "clothing", 1, { name: "hat" });

  assert.deepEqual(
    shelf.planShelfMove([moving, duplicate], {
      recordKey: moving.id,
      toLayer: "clothing",
    }),
    { ok: false, reason: "duplicate" },
  );
});

test("rejects an unknown source or destination without changing records", () => {
  const records = [trait("a", "hats", 1)];
  assert.deepEqual(
    shelf.planShelfMove(records, { recordKey: "missing", toLayer: "hats" }),
    { ok: false, reason: "missing" },
  );
  assert.deepEqual(
    shelf.planShelfMove(records, { recordKey: "a", toLayer: "" }),
    { ok: false, reason: "layer" },
  );
});

test("builds a shared reorder payload without leaking artwork or storage metadata", () => {
  assert.equal(typeof shelf?.rpcItems, "function");
  const record = trait("t_hat_hats_wip", "clothing", 1, {
    rowId: "row-1",
    shelfOrder: 2048,
    path: "private/path.png",
    blob: { secretBytes: true },
    rarity: 9,
  });

  assert.deepEqual(shelf.rpcItems([{ oldId: "old", oldKey: "row-1", record }]), [
    { id: "row-1", layer: "clothing", shelf_order: 2048 },
  ]);
  assert.throws(
    () => shelf.rpcItems([{ oldId: "old", oldKey: "old", record: { ...record, rowId: null } }]),
    /shared row id/i,
  );
});

test("applies a refreshed shared layer and order without replacing local artwork", () => {
  assert.equal(typeof shelf?.mergeRemoteShelfRecord, "function");
  const localBlob = { bytes: "local-art" };
  const local = trait("t_hat_hats_wip", "hats", 10, {
    name: "hat",
    rowId: "row-1",
    path: "team/collection/original.png",
    blob: localBlob,
    rarity: 7,
    shelfOrder: 1024,
  });
  const remote = {
    id: "row-1",
    kind: "trait",
    name: "hat",
    layer: "clothing",
    status: "wip",
    rarity: 7,
    shelf_order: 3072,
    path: "team/collection/original.png",
  };

  const refreshed = shelf.mergeRemoteShelfRecord(local, remote, new Set([local.id]));
  assert.equal(refreshed.id, "t_hat_clothing_wip");
  assert.equal(refreshed.layer, "clothing");
  assert.equal(refreshed.shelfOrder, 3072);
  assert.equal(refreshed.blob, localBlob);
  assert.equal(refreshed.path, local.path);
  assert.equal(refreshed.rarity, 7);
});

test("renames only the local card when a refreshed layer id would collide", () => {
  const local = trait("t_hat_hats_wip", "hats", 1, {
    name: "hat",
    rowId: "row-1",
  });
  const remote = {
    id: "row-1",
    kind: "trait",
    name: "hat",
    layer: "clothing",
    status: "wip",
    shelf_order: 1024,
    path: "same.png",
  };

  const refreshed = shelf.mergeRemoteShelfRecord(
    local,
    remote,
    new Set([local.id, "t_hat_clothing_wip"]),
  );
  assert.equal(refreshed.id, "t_hat-2_clothing_wip");
  assert.equal(refreshed.name, "hat-2");
  assert.equal(refreshed.rowId, "row-1");
});

test("hides and restores individual shelf cards without persistent record changes", () => {
  assert.equal(typeof shelf?.createVisibilityState, "function");
  const visibility = shelf.createVisibilityState();
  visibility.hide("a");
  assert.equal(visibility.isHidden("a"), true);
  assert.equal(visibility.count, 1);
  assert.equal(visibility.reveal, false);
  visibility.setReveal(true);
  assert.equal(visibility.reveal, true);
  visibility.show("a");
  assert.equal(visibility.isHidden("a"), false);
  assert.equal(visibility.count, 0);
});

test("isolates one card and show-all clears the temporary session", () => {
  const visibility = shelf.createVisibilityState();
  visibility.isolate(["a", "b", "c"], "b");
  assert.deepEqual(visibility.hiddenKeys(), ["a", "c"]);
  visibility.showAll();
  assert.deepEqual(visibility.hiddenKeys(), []);
  assert.equal(visibility.reveal, false);
  assert.equal(shelf.createVisibilityState().count, 0);
});

test("transfers a hidden local key when a cross-layer move changes its id", () => {
  const visibility = shelf.createVisibilityState();
  visibility.hide("t_hat_hats_wip");
  visibility.transfer("t_hat_hats_wip", "t_hat_clothing_wip");
  assert.equal(visibility.isHidden("t_hat_hats_wip"), false);
  assert.equal(visibility.isHidden("t_hat_clothing_wip"), true);
});
