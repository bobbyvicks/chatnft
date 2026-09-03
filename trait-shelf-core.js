(function (root) {
  "use strict";

  const ORDER_STEP = 1024;

  function hasOrder(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  function recordKey(record) {
    return String((record && (record.rowId || record.id)) || "");
  }

  function compareShelfRecords(a, b) {
    const aExplicit = hasOrder(a && a.shelfOrder);
    const bExplicit = hasOrder(b && b.shelfOrder);
    if (aExplicit !== bExplicit) return aExplicit ? -1 : 1;
    if (aExplicit && a.shelfOrder !== b.shelfOrder) return a.shelfOrder - b.shelfOrder;
    if (!aExplicit && Number(a && a.at || 0) !== Number(b && b.at || 0)) {
      return Number(b && b.at || 0) - Number(a && a.at || 0);
    }
    return recordKey(a).localeCompare(recordKey(b));
  }

  function orderedLayer(records, layer) {
    return records
      .filter(record => record && record.kind === "trait" && record.layer === layer)
      .slice()
      .sort(compareShelfRecords);
  }

  function nextShelfOrder(records, layer) {
    const values = orderedLayer(records, layer)
      .map(record => record.shelfOrder)
      .filter(hasOrder);
    return values.length ? Math.min(...values) - ORDER_STEP : 0;
  }

  function localTraitId(record, layer) {
    return "t_" + record.name + "_" + layer + "_" + (record.status || "wip");
  }

  function planShelfMove(records, move) {
    const wantedKey = String(move && move.recordKey || "");
    const toLayer = String(move && move.toLayer || "").trim();
    const source = records.find(record => recordKey(record) === wantedKey);
    if (!source || source.kind !== "trait") return { ok: false, reason: "missing" };
    if (!toLayer) return { ok: false, reason: "layer" };

    const duplicate = records.some(record => record !== source && record.kind === "trait" &&
      record.layer === toLayer && record.name === source.name &&
      (record.status || "wip") === (source.status || "wip"));
    if (duplicate) return { ok: false, reason: "duplicate" };

    const sourceLayer = source.layer;
    const sourceWithout = orderedLayer(records, sourceLayer)
      .filter(record => recordKey(record) !== wantedKey);
    const destination = sourceLayer === toLayer
      ? sourceWithout
      : orderedLayer(records, toLayer);
    const moved = {
      ...source,
      layer: toLayer,
      id: sourceLayer === toLayer ? source.id : localTraitId(source, toLayer),
    };
    const beforeKey = move && move.beforeKey != null ? String(move.beforeKey) : null;
    const beforeIndex = beforeKey == null
      ? -1
      : destination.findIndex(record => recordKey(record) === beforeKey);
    destination.splice(beforeIndex < 0 ? destination.length : beforeIndex, 0, moved);

    function normalizedUpdates(list, layer) {
      return list.map((record, index) => {
        const oldKey = record === moved ? wantedKey : recordKey(record);
        const original = records.find(candidate => recordKey(candidate) === oldKey) || record;
        const next = {
          ...record,
          layer,
          shelfOrder: ORDER_STEP * (index + 1),
        };
        if (oldKey === wantedKey && sourceLayer !== layer) next.id = localTraitId(source, layer);
        return { oldId: original.id, oldKey, record: next };
      });
    }

    const updates = sourceLayer === toLayer
      ? normalizedUpdates(destination, toLayer)
      : normalizedUpdates(sourceWithout, sourceLayer)
        .concat(normalizedUpdates(destination, toLayer));

    return {
      ok: true,
      sourceLayer,
      destinationLayer: toLayer,
      updates,
    };
  }

  function rpcItems(updates) {
    return updates.map(update => {
      const record = update && update.record;
      if (!record || !record.rowId) throw new Error("A shared row id is required");
      if (!hasOrder(record.shelfOrder)) throw new Error("A numeric shelf order is required");
      return {
        id: record.rowId,
        layer: record.layer,
        shelf_order: record.shelfOrder,
      };
    });
  }

  function mergeRemoteShelfRecord(local, remote, takenIds) {
    const taken = takenIds instanceof Set ? takenIds : new Set(takenIds || []);
    const layer = remote.kind === "trait" ? (remote.layer || "unsorted") : local.layer;
    const status = remote.kind === "trait" ? (remote.status || "wip") : local.status;
    const baseName = local.name;
    let name = baseName;
    let id = remote.kind === "ref" ? "ref_" + name : localTraitId({ ...local, name, status }, layer);
    let suffix = 2;
    while (id !== local.id && taken.has(id)) {
      name = baseName + "-" + suffix++;
      id = remote.kind === "ref" ? "ref_" + name : localTraitId({ ...local, name, status }, layer);
    }
    const refreshed = {
      ...local,
      id,
      rowId: remote.id,
      path: remote.path || local.path,
      kind: remote.kind || local.kind,
      name,
      synced: true,
    };
    if (refreshed.kind === "trait") {
      refreshed.layer = layer;
      refreshed.status = status;
      if (typeof remote.rarity === "number") refreshed.rarity = remote.rarity;
      if (hasOrder(remote.shelf_order)) refreshed.shelfOrder = remote.shelf_order;
      else delete refreshed.shelfOrder;
    }
    return refreshed;
  }

  function createVisibilityState() {
    const hidden = new Set();
    let reveal = false;
    return Object.freeze({
      hide(key) {
        hidden.add(String(key));
        reveal = false;
      },
      show(key) {
        hidden.delete(String(key));
        if (!hidden.size) reveal = false;
      },
      isolate(keys, keepKey) {
        hidden.clear();
        const keep = String(keepKey);
        for (const key of keys) if (String(key) !== keep) hidden.add(String(key));
        reveal = false;
      },
      showAll() {
        hidden.clear();
        reveal = false;
      },
      setReveal(value) {
        reveal = hidden.size ? Boolean(value) : false;
      },
      isHidden(key) {
        return hidden.has(String(key));
      },
      hiddenKeys() {
        return [...hidden].sort();
      },
      transfer(oldKey, newKey) {
        const oldValue = String(oldKey);
        if (!hidden.delete(oldValue)) return;
        hidden.add(String(newKey));
      },
      get count() {
        return hidden.size;
      },
      get reveal() {
        return reveal;
      },
    });
  }

  root.ChatNftTraitShelf = Object.freeze({
    ORDER_STEP,
    recordKey,
    compareShelfRecords,
    orderedLayer,
    nextShelfOrder,
    planShelfMove,
    rpcItems,
    mergeRemoteShelfRecord,
    createVisibilityState,
  });
})(typeof window === "object" ? window : globalThis);
