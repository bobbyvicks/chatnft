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

test("invalidates stale Vivid generations before they can commit UI state", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /let vividGenerationEpoch=0/);
  assert.match(html, /function invalidateVividGeneration\(\)\{\s*return \+\+vividGenerationEpoch;\s*\}/);
  assert.match(html, /pxSrc=\{data:d,width:w,height:hh\};\s*invalidateVividGeneration\(\);/);
  assert.match(html, /pxvivid'\)\.addEventListener\('change',\(\)=>\{\s*invalidateVividGeneration\(\);/);
  assert.match(html, /pxvividgrid'\)\.addEventListener\('change',\(\)=>\{\s*invalidateVividGeneration\(\);/);
  assert.match(html, /const request=\{epoch:invalidateVividGeneration\(\),source:pxSrc,grid:pxVividOpts\(\)\.size,mode:\$\('pxvivid'\)\.checked\};/);
  assert.match(html, /request\.epoch===vividGenerationEpoch\s*&&request\.source===pxSrc\s*&&request\.grid===pxVividOpts\(\)\.size\s*&&request\.mode===\$\('pxvivid'\)\.checked/);
  assert.match(html, /if\(!vividRequestCurrent\(request\)\) return;\s*const next=/);
  assert.match(html, /finally\{\s*if\(vividRequestCurrent\(request\)\) syncVividGenerationButton\(\);\s*\}/);
  assert.match(html, /mode:'vivid',owner:request/);
  assert.match(html, /\{vivid:pxData\.mode==='vivid',owner:pxData\.owner\}/);
});

test("finalizes local generations against the normalized source silhouette", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /vividCore\.finalizeCreative\(normalized\.data,recovered\.data,grid,grid,\{grid\}\)/);
  assert.match(html, /vividCore\.verify\(repaired\.data,grid,grid,\{grid,alphaMask:repaired\.alphaMask\}\)/);
});
