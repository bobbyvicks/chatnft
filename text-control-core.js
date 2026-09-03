(function () {
  "use strict";

  function accelerationMultiplier(heldMilliseconds) {
    const held = Math.max(0, Number(heldMilliseconds) || 0);
    if (held < 600) return 1;
    if (held < 1400) return 5;
    if (held < 2800) return 10;
    return 50;
  }

  function decimalPlaces(value) {
    const text = String(value);
    const point = text.indexOf(".");
    return point < 0 ? 0 : text.length - point - 1;
  }

  function stepValue(value, direction, heldMilliseconds, options = {}) {
    const step = Math.abs(Number(options.step) || 1);
    const min = Number.isFinite(Number(options.min)) ? Number(options.min) : -Infinity;
    const max = Number.isFinite(Number(options.max)) ? Number(options.max) : Infinity;
    const current = Number.isFinite(Number(value)) ? Number(value) : 0;
    const sign = Number(direction) < 0 ? -1 : 1;
    const multiplier = accelerationMultiplier(heldMilliseconds);
    let next = current + sign * step * multiplier;
    next = Math.max(min, Math.min(max, next));
    if (options.integer) return Math.round(next);
    const precision = Math.max(1, decimalPlaces(step));
    return Number(next.toFixed(precision));
  }

  globalThis.ChatNftTextControls = { accelerationMultiplier, stepValue };
})();
