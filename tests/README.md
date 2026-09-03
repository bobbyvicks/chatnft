# Tests

    npm test            # the whole suite, headless
    npm run test:ui     # pick and watch individual tests
    npm run serve       # just serve the page at :5288

34 tests, about 40 seconds. Every one exists because something shipped broken
and was found by hand afterwards. The one-off browser checks that found them
were thrown away each time; these are the same checks, kept.

## What they cover, and why each one is here

**resize** — the "inside" mode shipped broken in the configuration it ships in.
Snap is ON by default and the snap rule was the one for canvas sizes, so on a
160 canvas every shrink snapped back to 160 and did nothing, and on a 120 canvas
asking to shrink 20% blew the trait up and cropped it. Every check written at
the time turned snap off first, so the default was the one setting never tried.
These tests never touch snap unless they are deliberately testing the other
setting.

**downscaling** — twenty one-pixel lines used to come out as 28 at 136, 32 at
128 and zero at 64 and below. Overlapping windows duplicated them, then the
under-half coverage rule deleted them. A one-pixel outline came out with zero
cells on all four edges.

**recolour** — Erase leaving a ghost at a soft edge, and undo silently
unpicking a hand-built selection while the swatches sat there looking normal.

**brush** — the big brush was unusable at 14ms a dab, the bracket keys died the
moment the slider had focus, and once the keyboard was let through, Backspace
from that slider threw you out of the editor with no confirmation.

**base** — the character used to be stretched to the art canvas on every redraw,
so resizing could never change how a trait sat on it, and shrinking the canvas
cut its head and feet off entirely.

**panel** — the panel scrolled 2,780px inside a 1,185px window, which is how a
button that had shipped hours earlier still could not be found.

## Two traps this codebase sets

**Bare names, not `window`.** The page declares its state with top-level `let` —
`ctx`, `art`, `brush`, `tool`, `zoom`, `fileName`. Those live in the global
lexical environment: reachable inside `page.evaluate` as a bare name, never as a
property of `window`. `window.ctx` is `undefined`, and `window.fileName = x`
creates a new property the page never reads. Both mistakes have been made here.

**The sign-in wall.** A visitor with no session meets a full-screen scrim over
the whole app, so every click is intercepted and every failure reads as a broken
control. `openTrait` steps past it. If that wall is ever made optional the line
becomes a no-op, which is the right way round.

## Adding a test

Make it fail first. Revert the fix it is meant to guard, watch the test go red,
put the fix back. A test that has never failed is a test that has never been
shown to test anything — and this suite has already caught one of its own:
"shrinking works on a canvas that is not a multiple of the cell count" asserted
only that the trait got *smaller*, and passed on the very defect it existed for,
because a cropped blow-up is also smaller. It asserts the ratio now.
