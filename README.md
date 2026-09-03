# ChatNFT

A pixel art editor that works on the grid your art was actually drawn on.

Live: https://pixelbench.vercel.app

(The name is ChatNFT; the URL still says pixelbench because chatnft.vercel.app and
chat-nft.vercel.app are both already taken by other people. Free at time of writing:
chatnfts, chatnft-app, chatnftapp, getchatnft, chatnft-io.)

## What it does

- **Measures the grid.** Reads the repeating block size from where the art's own
  edges fall, so it works even when a bad resize left a fractional block size.
  It suggests a resolution; you confirm it.
- **Rebuilds.** Each cell becomes the median of the source pixels under it, so no
  colour appears that was not already in the image.
- **Pulls traits off characters.** Given the bare character and the same character
  wearing something, the difference is the trait, returned on transparency.
  Measured at 97% recall and 100% precision on a real submission.
- **Edits.** Pencil, eraser, fill, eyedropper, brush sizes 1-8, undo/redo,
  1-48x zoom, pinch and pan, palette taken from your own image.
- **Keeps a project.** Traits are saved per layer in IndexedDB and can be
  exported together as a zip with the layer folders intact.

Core image editing runs in the browser. The optional Vivid creative revision sends the image only to ComfyUI on your own machine, not to a cloud image model.

## Local Vivid Pixel Agent

1. Open ComfyUI Desktop and wait until its local server is ready.
2. In this repository, run `npm install` once and then `npm run start:local`.
3. Open http://127.0.0.1:4173/.
4. Drop a PNG, JPEG, or WebP and choose **Turn this into a trait**.
5. Keep **Use the saved Vivid Pixel Agent rules** enabled.
6. Choose the trait profile before generating:
   - **Standard traits (128 → 1024)** preserves the existing hats and accessories workflow.
   - **Skins (160 → 1280)** maps any input size to the closest source pixels on the 160×160 native grid, locks the alpha silhouette cell-for-cell to `assets/canonical-skin-mask-160.png`, and outputs the exact 8× 1280×1280 size required by `traits/base/approved/README.md`.
7. Use the immediate preview for faithful cleanup, or enter an instruction and choose **Generate locally with ComfyUI** for a creative revision.
8. Open the verified result in the editor. After any hand edits, choose its layer and status, then press **Save exact PNG to disk**. The live editor pixels are scaled with nearest-neighbor only and written directly under `E:\X content\pixel art_\new-traits\<layer>\<status>\`; no extraction, palette rebuild, or ComfyUI rerun occurs during this save. A skin save is rejected unless every 8×8 output cell matches the canonical 160×160 body silhouette exactly.

The art contract is stored in `pixel-agent.config.json`, the standard-trait palette is stored in `palette/vivid-fixed-128.json`, skin palettes are derived from each source within the configured colour cap, and creative rules are stored in `agent/vivid-pixel-instructions.md`. Tests enforce these files; the workflow does not rely on chat memory.

## Deploying

One static file, no build step. Vercel serves `index.html` as-is.
