import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("wires the Vivid Agent controls without removing the generic converter", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /<script src="\.\/pixel-agent-core\.js"><\/script>/);
  assert.match(html, /id="pxvivid"/);
  assert.match(html, /id="pxvividgrid"/);
  assert.match(html, /id="pxinstruction"/);
  assert.match(html, /id="pxgenerate"/);
  assert.match(html, /id="pxagentstatus"/);
  assert.match(html, /id="pxswatches"/);
  assert.match(html, /id="dlVivid"/);
  assert.match(html, /id="dlVividSwatch"/);
  assert.match(html, /\/api\/pixel-agent\/generate/);
  assert.match(html, /ChatNftPixelAgent\.create/);
  assert.match(html, /id="pxsize"/);
  assert.match(html, /function pixelate\(/);
});
