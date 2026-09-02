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

Everything runs in the browser. No image is uploaded anywhere.

## Local Vivid Pixel Agent

1. Open ComfyUI Desktop and wait until its local server is ready.
2. In this repository, run `npm install` once and then `npm run start:local`.
3. Open http://127.0.0.1:4173/.
4. Drop a PNG, JPEG, or WebP and choose **Turn this into a trait**.
5. Keep **Use the saved Vivid Pixel Agent rules** enabled.
6. Use the immediate preview for faithful cleanup, or enter an instruction and choose **Generate locally with ComfyUI** for a creative revision.
7. Open the verified result in the editor and download the 1024×1024 PNG and used-color swatch.

The art contract is stored in `pixel-agent.config.json`, the palette is stored in `palette/vivid-fixed-128.json`, and creative rules are stored in `agent/vivid-pixel-instructions.md`. Tests enforce these files; the workflow does not rely on chat memory.

## Deploying

One static file, no build step. Vercel serves `index.html` as-is.
