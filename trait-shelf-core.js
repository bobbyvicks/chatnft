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

  root.ChatNftTraitShelf = Object.freeze({
    ORDER_STEP,
    recordKey,
    compareShelfRecords,
    orderedLayer,
    nextShelfOrder,
    planShelfMove,
  });
})(typeof window === "object" ? window : globalThis);
