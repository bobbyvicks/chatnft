import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("wires the Vivid Agent controls without removing the generic converter", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /<script src="\.\/pixel-agent-core\.js"><\/script>/);
  assert.match(html, /id="pxvivid"/);
  assert.match(html, /id="pxvividgrid"/);
  assert.match(html, /id="pxvividprofile"/);
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
  assert.match(html, /id="pxbefore"/);
  assert.match(html, /id="pxout"/);
  assert.match(html, />Before</);
  assert.match(html, />After</);
});

test("offers a lossless disk save from the live editor canvas", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /id="savedisk"/);
  assert.match(html, /async function saveExactPngToDisk\(\)/);
  assert.match(html, /ctx\.getImageData\(0,0,art\.width,art\.height\)/);
  assert.match(html, /imageSmoothingEnabled=false/);
  assert.match(html, /fetch\('\/api\/pixel-agent\/save'/);
  assert.match(html, /\$\('savedisk'\)\.onclick=saveExactPngToDisk/);
});

test("selects the skin profile as one 160-cell grid and carries its 1280 canvas through generation and export", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /function syncVividProfile\(\)/);
  assert.match(html, /profile:pxVividOpts\(\)\.profile/);
  assert.match(html, /outputSize:pxVividOpts\(\)\.outputSize/);
  assert.match(html, /imageDataUrl:canvasFromRgba\(focused\.data,focused\.width,focused\.height\)/);
  assert.match(html, /instruction:generationInstruction,profile:request\.profile,grid/);
  assert.match(html, /draft\.width!==request\.outputSize\|\|draft\.height!==request\.outputSize/);
  assert.match(html, /renderGridToCanvas\(data,art\.width,outputSize\)/);
});

test("loads the canonical skin mask and uses it for preview and Comfy finalization", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /let vividCanonicalMasks=\{\}/);
  assert.match(html, /decodePngDataUrl\('\.\/'\+profile\.canonicalMask\)/);
  assert.match(html, /canonicalAlphaMask:vividCanonicalMasks\[profile\]/);
  assert.match(html, /canonicalAlphaMask:vividCanonicalMasks\[request\.profile\]/);
});

test("maps oversized or undersized skin art to 160 cells using the closest source pixel", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /function normalizeVividGrid\(data,width,height,grid,profile\)/);
  assert.match(html, /profile==='skins'\s*\?vividCore\.resizeNearest\(data,width,height,grid,grid\)\s*:vividCore\.recoverToGrid\(data,width,height,grid\)/);
  assert.match(html, /normalizeVividGrid\(canvas\.data,canvas\.width,canvas\.height,grid,profile\)/);
  assert.match(html, /normalizeVividGrid\(draft\.data,draft\.width,draft\.height,grid,request\.profile\)/);
});

test("invalidates stale Vivid generations before they can commit UI state", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /let vividGenerationEpoch=0/);
  assert.match(html, /function invalidateVividGeneration\(\)\{\s*return \+\+vividGenerationEpoch;\s*\}/);
  assert.match(html, /pxSrc=\{data:d,width:w,height:hh\};\s*invalidateVividGeneration\(\);/);
  assert.match(html, /pxvivid'\)\.addEventListener\('change',\(\)=>\{\s*invalidateVividGeneration\(\);/);
  assert.match(html, /pxvividgrid'\)\.addEventListener\('change',\(\)=>\{\s*invalidateVividGeneration\(\);/);
  assert.match(html, /const request=\{epoch:invalidateVividGeneration\(\),source:pxSrc,grid:pxVividOpts\(\)\.size,mode:\$\('pxvivid'\)\.checked,\s*profile:pxVividOpts\(\)\.profile,outputSize:pxVividOpts\(\)\.outputSize\};/);
  assert.match(html, /request\.epoch===vividGenerationEpoch\s*&&request\.source===pxSrc\s*&&request\.grid===pxVividOpts\(\)\.size\s*&&request\.mode===\$\('pxvivid'\)\.checked\s*&&request\.profile===pxVividOpts\(\)\.profile\s*&&request\.outputSize===pxVividOpts\(\)\.outputSize/);
  assert.match(html, /if\(!vividRequestCurrent\(request\)\) return;\s*const next=/);
  assert.match(html, /finally\{\s*if\(vividRequestCurrent\(request\)\) syncVividGenerationButton\(\);\s*\}/);
  assert.match(html, /mode:'vivid',owner:\{\.\.\.request,alphaMask:repaired\.alphaMask/);
  assert.match(html, /\{vivid:pxData\.mode==='vivid',owner:pxData\.owner\}/);
});

test("finalizes local generations against the normalized source silhouette", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /instruction:request\.instruction/);
  assert.match(html, /vividCore\.finalizeCreative\(normalized\.data,recovered\.data,grid,grid,\{\s*grid,instruction:request\.instruction,\s*paletteHex:request\.paletteHex,maxOpaqueColors:request\.maxOpaqueColors,\s*preserveSourceBlack:request\.preserveSourceBlack,\s*cleanClothingShading:request\.cleanClothingShading,\s*canonicalAlphaMask:vividCanonicalMasks\[request\.profile\]\s*\}\)/);
  assert.match(html, /anchoredWhiteMask:repaired\.anchoredWhiteMask/);
  assert.match(html, /anchoredBlackMask:repaired\.anchoredBlackMask/);
  assert.match(html, /anchorAuthorization:repaired\.anchorAuthorization/);
  assert.match(html, /anchoredWhiteMask:editorVividOwner&&editorVividOwner\.anchoredWhiteMask/);
  assert.match(html, /anchoredBlackMask:editorVividOwner&&editorVividOwner\.anchoredBlackMask/);
});

test("derives and carries the skin source palette through generation, editing, and download verification", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /function vividPaletteOptions\(profile,sourceData\)/);
  assert.match(html, /vividCore\.deriveSourcePalette\(sourceData,paletteRule\.maxOpaqueColors\)/);
  assert.match(html, /paletteHex:request\.paletteHex,maxOpaqueColors:request\.maxOpaqueColors/);
  assert.match(html, /paletteHex:editorVividOwner&&editorVividOwner\.paletteHex/);
  assert.match(html, /vividCore\.usedColors\(data,editorVividOwner&&editorVividOwner\.paletteHex\)/);
});

test("offers fixed-project-palette clothing cleanup without changing the standard profile", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /<option value="clothing">Clothing — fixed project palette \+ locked black ink \(128\/256 → 1024\)<\/option>/);
  assert.match(html, /profiles\[profile\]/);
  assert.match(html, /paletteRule\.mode==='clothing'\s*\?vividCore\.deriveClothingPalette\(sourceData,paletteRule\.maxOpaqueColors\)/);
  assert.match(html, /preserveSourceBlack:paletteRule\.mode==='clothing'/);
  assert.match(html, /cleanClothingShading:paletteRule\.mode==='clothing'/);
  assert.match(html, /request\.profile==='clothing'\s*\?vividCore\.focusOpaqueRegion\(recovered\.data,grid,grid,\{padding:12,targetSize:request\.outputSize\}\)/);
  assert.match(html, /vividCore\.restoreFocusedRegion\(draft\.data,draft\.width,draft\.height,focused\.transform\)/);
  assert.match(html, /selected\.palette\.maxOpaqueColors.*colors max/);
});

test("clears an actionable result synchronously while Vivid mode or grid is changing", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /function clearPixelResult\(\)\{\s*pxData=null;\s*vividResult=null;\s*\$\('pxgo'\)\.disabled=true;/);
  assert.match(html, /pxvivid'\)\.addEventListener\('change',\(\)=>\{\s*invalidateVividGeneration\(\);\s*clearPixelResult\(\);/);
  assert.match(html, /pxvividgrid'\)\.addEventListener\('change',\(\)=>\{\s*invalidateVividGeneration\(\);\s*clearPixelResult\(\);/);
  assert.match(html, /function queuePixelRender\(\)\{\s*clearPixelResult\(\);\s*pxRender\(\);\s*\}/);
  assert.match(html, /addEventListener\("input",queuePixelRender\)/);
});

test("renders matched before and after Vivid previews without changing generic controls", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /function renderVividBefore\(data,grid\)/);
  assert.match(html, /\$\('pxbeforewrap'\)\.hidden=!enabled/);
  assert.match(html, /renderVividBefore\(normalized\.data,grid\)/);
  assert.match(html, /\$\('pxgenericcontrols'\)\.hidden=enabled/);
});

test("bounds browser generation and restores the controls after a timeout", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /signal:AbortSignal\.timeout\(vividContract\.comfy\.timeoutMilliseconds\+5000\)/);
  assert.match(html, /error\.name==='TimeoutError'\|\|error\.name==='AbortError'/);
  assert.match(html, /finally\{\s*if\(vividRequestCurrent\(request\)\) syncVividGenerationButton\(\);\s*\}/);
});

test("can visibly load a same-origin local source without bypassing the normal analysis flow", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /async function loadSourceFromQuery\(\)/);
  assert.match(html, /const target=new URL\(source,location\.href\)/);
  assert.match(html, /target\.origin!==location\.origin/);
  assert.match(html, /load\(new File\(\[blob\],name,\{type:blob\.type\|\|'image\/png'\}\)\)/);
});

test("presents letter shape, shadow position, and whole-box tilt as plainly named control groups", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

  assert.match(html, /<fieldset class="texttransform" aria-labelledby="textshapeheading">/);
  assert.match(html, /id="textshapeheading">Shape the letters</);
  assert.match(html, />Top left</);
  assert.match(html, />Top right</);
  assert.match(html, />Right side up</);
  assert.match(html, />Right side down</);

  assert.match(html, /<fieldset class="texttransform" aria-labelledby="textshadowheading">/);
  assert.match(html, /id="textshadowheading">Move the shadow</);
  assert.match(html, />Shadow left</);
  assert.match(html, />Shadow up</);
  assert.match(html, />Shadow down</);
  assert.match(html, />Shadow right</);

  assert.match(html, /<fieldset class="texttransform" aria-labelledby="textboxheading">/);
  assert.match(html, /id="textboxheading">Tilt the whole text box</);
  assert.match(html, />Box top left</);
  assert.match(html, />Box top right</);
  assert.match(html, />Box right side up</);
  assert.match(html, />Box right side down</);

  assert.doesNotMatch(html, />right [↑↓]</);
  assert.doesNotMatch(html, />wrap [←→]</);
  assert.doesNotMatch(html, />shadow [←↑↓→]</);
});
