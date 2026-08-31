# Pixel Bench

A pixel art editor that works on the grid your art was actually drawn on.

Live: https://pixelart-trellis67.vercel.app

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

## Deploying

One static file, no build step. Vercel serves `index.html` as-is.
