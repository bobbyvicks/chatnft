# Local Vivid Pixel Agent Design

## Goal

Add a local image-to-image agent to ChatNFT. A user uploads an image, writes a short instruction, and receives a corrected or upgraded PNG without manually operating ComfyUI. The system runs on the user's computer and does not require an image-generation API token.

## Durable parameter storage

The art contract must not depend on chat memory or a model remembering prior instructions.

- `pixel-agent.config.json` stores the exact machine-readable settings and a schema version.
- `agent/vivid-pixel-instructions.md` stores the creative instructions sent to ComfyUI.
- `pixel-agent-core.js` enforces the rules that can be checked deterministically.
- `tools/pixel-agent-check.cjs` locks the contract with regression tests and the bucket-hat fixture.
- `workflows/vivid-pixel-img2img.json` stores the local ComfyUI graph used by the bridge.

Changing the rules therefore requires an explicit file change and a passing test run. A fresh conversation or a different local model cannot silently change them.

## Fixed art contract

- Accepted inputs: PNG, JPEG/JPG, and WebP.
- Final canvas: exactly 1024 by 1024 pixels.
- A non-1024 square input is resized as a complete canvas to 1024 by 1024 with nearest-neighbor sampling.
- The canvas is never cropped, recentered, or content-aware repositioned.
- The trait keeps the same relative position on the full canvas.
- Working grids: 32, 64, 128, or 256; default 128.
- Palette: locked `Vivid Fixed 128`, including greys.
- Per-trait limit: no more than 16 opaque colors, including pure black.
- Alpha is binary: every output pixel is either fully transparent or fully opaque.
- Dithering, antialiasing, blur, and interpolated scaling are forbidden.
- The pure-black outline is one working-grid pixel thick and belongs only to the exterior silhouette and intentional major internal separations.
- A colored or white opaque component outside the black exterior silhouette is invalid and removed when it is isolated from the subject.
- Interior white artwork and lettering, including the `NEET` emblem in the first fixture, must remain intact unless the user's instruction explicitly changes it.
- Output includes the corrected 1024 by 1024 PNG and a used-color swatch preview.
- The source file is never overwritten.

## Architecture

### ChatNFT interface

The local ChatNFT page gains a `Vivid Pixel Agent` panel with:

- an image upload/drop target;
- a plain-language instruction field;
- a working-grid selector;
- a `Generate locally` button;
- before/after previews at matching scale;
- validation results, used-color count, and palette swatches;
- download buttons for the corrected PNG and its swatch.

The existing editor and generic conversion tools remain available.

### Local bridge

A small Node server serves ChatNFT and owns the connection to `http://127.0.0.1:8188`.

The bridge:

1. accepts an uploaded image and instruction from the local page;
2. writes a uniquely named temporary input into ComfyUI's input area;
3. fills the saved image-to-image workflow with that input, the instruction, fixed model names, and conservative denoise settings;
4. submits the graph to ComfyUI and waits for completion;
5. returns the generated draft to the browser;
6. removes temporary request files after the browser has received the result.

The bridge listens on loopback only. It does not accept remote network connections and does not upload art to an external service.

### ComfyUI responsibility

ComfyUI performs only the semantic image-to-image change requested by the user. Its prompt includes the durable creative instructions and the user's current instruction. The denoise strength is intentionally conservative so the source remains recognizable.

ComfyUI is not the authority for canvas size, position, edge sharpness, palette membership, color count, alpha, or outline correctness.

### Deterministic repair and validation

The browser core processes the original upload and the ComfyUI draft on the fixed working grid. It then:

1. restores the full-canvas alignment;
2. hardens transparency;
3. maps opaque pixels to the fixed palette;
4. limits the result to 16 colors including black;
5. removes isolated opaque components outside the connected subject silhouette;
6. rebuilds the allowed black exterior outline without changing the trait's location;
7. uses nearest-neighbor scaling for the final 1024 output;
8. validates every fixed rule before enabling download.

For precise cleanup requests such as the bucket-hat's stray white dot, the deterministic repair can satisfy the request without allowing the generative draft to alter unrelated pixels.

## First fixture: NEET bucket hat

Input fixture:

`E:/X content/pixel art_/traits/hair-headwear/approved/neet-bucket-hat.png`

The fixture is 1254 by 1254. The expected agent behavior is:

- convert the complete canvas to 1024 by 1024 with nearest-neighbor sampling;
- preserve the hat's relative position;
- remove the isolated exterior white artifact near the upper-right edge;
- retain the black exterior border;
- retain the internal white globe and `NEET` lettering;
- introduce no blur, partial alpha, extra colors, or outside artifacts.

## Error handling

- If ComfyUI is closed or unreachable, the page explains how to open it and offers a retry.
- Unsupported or undecodable files are rejected before submission.
- Empty instructions default to faithful cleanup only.
- A ComfyUI failure never replaces the source or produces a downloadable result.
- Any deterministic validation failure blocks download and names the violated rule.
- Temporary files use unique request identifiers so simultaneous jobs cannot collide.

## Verification

Automated checks cover:

- configuration schema and exact fixed values;
- accepted formats and the 1024 output contract;
- nearest-neighbor full-canvas normalization;
- binary alpha and fixed-palette membership;
- the 16-color ceiling and required black inclusion;
- outside-component cleanup without deleting connected interior white details;
- ComfyUI request construction without external URLs or API tokens;
- preservation of source files;
- the NEET bucket-hat regression fixture.

Browser verification covers upload, local generation, progress and error states, matched before/after previews, validation reporting, and both downloads.

## Out of scope

- Remote hosting of the local bridge or ComfyUI.
- API keys, paid image providers, or cloud model execution.
- Automatic deployment to the public ChatNFT site.
- Batch processing in the first version.
- Overwriting approved source assets.

