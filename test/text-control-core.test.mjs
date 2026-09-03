import test from "node:test";
import assert from "node:assert/strict";

try {
  await import("../text-control-core.js");
} catch {
  // The first red test intentionally runs before the control core exists.
}

const controls = globalThis.ChatNftTextControls;

test("fine text controls move by tenths and accelerate the longer they are held", () => {
  assert.equal(typeof controls?.stepValue, "function");
  assert.equal(controls.stepValue(1, 1, 0, { step: 0.1, min: 1, max: 16 }), 1.1);
  assert.equal(controls.stepValue(1, 1, 800, { step: 0.1, min: 1, max: 16 }), 1.5);
  assert.equal(controls.stepValue(1, 1, 1800, { step: 0.1, min: 1, max: 16 }), 2);
});

test("accelerated text controls clamp exactly to their configured limits", () => {
  assert.equal(typeof controls?.stepValue, "function");
  assert.equal(controls.stepValue(15.9, 1, 1800, { step: 0.1, min: 1, max: 16 }), 16);
  assert.equal(controls.stepValue(0, -1, 4000, { step: 0.1, min: 0, max: 48 }), 0);
});

test("whole-cell controls share hold acceleration without creating fractional cells", () => {
  assert.equal(typeof controls?.stepValue, "function");
  assert.equal(controls.stepValue(1, 1, 0, { step: 1, min: 0, max: 64, integer: true }), 2);
  assert.equal(controls.stepValue(1, 1, 800, { step: 1, min: 0, max: 64, integer: true }), 6);
});
