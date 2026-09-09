/* The tests that reach controls Edges and holes took into its panel.

   Same treatment the other moves needed, and nothing more: what these tests
   claim is unchanged, only where the control they press now lives. The three
   calls that opened it as a SECTION would not merely fail to find the
   controls - openSection throws "no section called Edges and holes" - so
   they have to name the panel instead.
*/
const fs = require('fs');
const REPO = 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/';

const edit = (rel, fn) => {
  const p = REPO + rel;
  let t = fs.readFileSync(p, 'utf8');
  const crlf = t.indexOf('\r\n') >= 0;
  const nl = s => (crlf ? s.replace(/\n/g, '\r\n') : s);
  const api = {
    swap(from, to) {
      from = nl(from); to = nl(to);
      const n = t.split(from).length - 1;
      if (n !== 1) throw new Error(rel + ': expected 1 of ' + from.slice(0, 60) + ' (found ' + n + ')');
      t = t.split(from).join(to);
    },
    every(n, from, to) {
      from = nl(from); to = nl(to);
      const found = t.split(from).length - 1;
      if (found !== n) throw new Error(rel + ': expected ' + n + ' of ' + from.slice(0, 50) + ', found ' + found);
      t = t.split(from).join(to);
    },
  };
  fn(api);
  fs.writeFileSync(p, t);
  console.log(rel + ' updated');
};

edit('tests/panel.spec.js', ({ every }) => {
  every(3, "    await openSection(page, 'Edges and holes');",
    "    await openPanel(page, 'eh');");
});

edit('tests/paneldensity.spec.js', ({ swap }) => {
  swap("try { for (const id of ['cl', 'tx', 'tf', 'bl', 'sv']) railPanel(id, true); } catch (_) {}",
    "try { for (const id of ['cl', 'tx', 'eh', 'tf', 'bl', 'sv']) railPanel(id, true); } catch (_) {}");
});
