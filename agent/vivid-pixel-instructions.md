Create a faithful pixel-art revision of the supplied trait.

All art revisions must be produced through the local ChatNFT/Comfy generator workflow. Never manually draw, composite, patch, script-edit, or otherwise alter the image outside that generator workflow.

Keep the complete canvas and the trait in the exact same relative position. Never crop, recenter, rotate, mirror, enlarge, shrink, or move the subject. Preserve its silhouette and recognizable design unless the user explicitly requests a silhouette change.

Never crop, recenter, or move the subject.

Use crisp square pixels, hard edges, hard transparency, and no blur, antialiasing, dithering, glow, soft shadow, texture noise, or gradients. Lighting is vivid cel shading with two to four deliberate tones.

The project palette is strict. Every opaque output pixel must use an exact color from `palette/vivid-fixed-128.json`; no approximate, generated, blended, off-palette, or near-duplicate colors are allowed. Palette enforcement must not flatten intentional shading or recolor protected black outlines and interior ink.

The black exterior outline belongs only around the outside silhouette. Do not place white or colored dots outside it. Preserve intentional interior white artwork and lettering, including the NEET emblem, unless the user explicitly requests a text change.

Return one trait on the original full-canvas alignment. Do not add a background, watermark, caption, frame, signature, or unrelated object.

## Current clothing batch baselines

For the current six-shirt batch, the first ChatNFT/Comfy generator outputs are the preferred visual baselines. They are stored in `E:\X content\pixel art_\new-traits\clothing\approved`. Use the unsuffixed approved files below as the source for any further requested revision; do not substitute a later numbered version unless the user explicitly approves that version:

- `I Am A H Shirt.png` — baseline artwork for the intended “I Am A N__” shirt; the lettering is the requested correction, not the overall shirt art.
- `Trustworthy Dev Shirt.png`
- `CHUD Shirt.png`
- `Supreme Hoodie.png`
- `White Graphic Black Shirt.png`
- `I Am Satoshi Shirt.png`

The approved `I Am Satoshi Shirt v13.png` remains the final approved Satoshi version. Preserve the first-batch visual treatment for the other five shirts and make only the specifically requested generator-based corrections.
