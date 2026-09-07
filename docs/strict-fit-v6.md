# Curated v6 collection

This extends Claude's native live review, team decisions and LaunchMyNFT export. It does not add a second review UI.

In the character builder, **Load reviewed v6 collection rules** validates the current renamed collection, imports the reviewed defaults and sets the paint order. The team's human answers still outrank imported defaults, as the native importer reports. Use **Review pairs** to change them and **Download for LaunchMyNFT** to export the current team rules. The separate **Download v6 for LaunchMyNFT** link is the unedited baseline.

The button requires all 249 uploaded traits to be present under the current category/name combinations. It reports missing names and makes no import when the inventory is incomplete. Files from `APPROVED TRAITS - WEBSITE UPLOAD` can enter as WIP under the existing importer; approve them or enable Include WIP before generating.

## Source

The validated source directory is `E:/X content/pixel art_/trait-records/trait-names-and-layer-order-20260906`:

- `trait-rules-strict-fit-v6.json`: 59 conditions / 189 actions, copied byte-for-byte to `rules/trait-rules-strict-fit-v6.json`.
- `compatibility-details.json`: 427 reviewed/existing pair policies. The collection bundle expresses every policy as an explicit action, including unrestricted lists, so re-import clears restrictions removed from the canonical export. These extra allow-all actions add no restriction to a fresh collection.
- `validation-fixture.json`: the exact 249 uploaded names and paint order. Two approved-only Noun glasses remain excluded.

Paint order, back to front: backgrounds, skins, mouth, hair, eyes, glasses, hats, ears, clothing, chains, costumes, extras, masks.

V6 tightens 77 pools and rejects 635 previously allowed pairings. Solgods hides hats and keeps all hairstyles. Raised hoods and fitted costume head coverings hide hats. Closed caps keep checked low hairstyles. Glasses keep eyes enabled; masks hide separate glasses.

## Validation and collaboration

`npm run test:curated-rules` executes the actual native import/merge/generation functions offline, checks all v6 exclusions over 10,000 draws, verifies stale eye exclusions are cleared, and verifies decision provenance survives saving/reloading. It also checks the new button's inventory guard and ordering. These are not substitutes for browser visual review.

The only native persistence fix is retaining `src` in saved decisions. Without that field, file decisions load as human decisions and incorrectly outrank later imports. No database migration, schema change or alternate sync path was added.

The earlier Codex static-review prototype is kept locally on `feat/strict-fit-pixelbench-v6` and must not be deployed over this native integration.
