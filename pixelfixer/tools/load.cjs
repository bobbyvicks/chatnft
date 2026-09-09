/* Load every module into THIS realm, in filename order.

   Not a vm sandbox: the modules type-check their inputs with `instanceof
   Uint8Array`, and a typed array made in one realm is not an instance of
   another realm's constructor - so a sandbox makes every entry point throw
   on perfectly good input. Measured: selfsim refused a Uint8Array of exactly
   the right length for that reason alone. */
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'src');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort();
for (const f of files) (0, eval)(fs.readFileSync(path.join(dir, f), 'utf8'));
module.exports = { PF: globalThis.PF, files };
