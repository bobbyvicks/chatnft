# imports

Staged PNGs an agent can open by link, without a file dialog:

    index.html?source=/imports/whatever.png&name=Whatever

The link stages the file and says so; opening it is still a press, or
`PB.openLinked()` for something without a mouse.

Only this folder, only `.png`, only same-origin, 25 MB cap, and the response
has to actually be a PNG. `probe.png` and `notreally.png` are test fixtures -
`notreally.png` is deliberately not a PNG, so the response check has
something to catch.
