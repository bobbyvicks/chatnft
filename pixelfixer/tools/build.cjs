/* Concatenate src/pf-*.js, in filename order, into one file the page can
   carry. Not a bundler: a concatenation, because every module is already an
   IIFE that hangs its exports on one global and there is nothing to resolve.
   The numeric prefixes ARE the load order, and the base module has to be
   first because the rest read from it at load. */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const dir = path.join(root, 'src');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort();
if (!files.length) throw new Error('no modules in src/');

const head = [
  '/* Pixel Art Fixer - the detector and reconstructor from',
  ' * https://github.com/Retro-Diffusion/pixel-art-fixer (commit ef376e5),',
  ' * ported from Python to dependency-free JavaScript.',
  ' *',
  ' * FAST MODE ONLY. core.detect refuses mode:"full" - the arbitration stage',
  ' * is not ported. Fast mode recovers the exact native size on every fixture',
  ' * and example image measured, and the reconstruction is byte-identical to',
  ' * the reference; tools/test-detect.js and tools/test-recon.js are where',
  ' * that is measured rather than claimed.',
  ' *',
  ' * Built by tools/build.js from ' + files.length + ' modules. Do not edit here -',
  ' * edit src/ and rebuild, or the parity harness stops describing this file.',
  ' */',
  ''].join('\n');

let out = head;
for (const f of files) {
  out += '\n/* ==== ' + f + ' ' + '='.repeat(Math.max(0, 60 - f.length)) + ' */\n';
  out += fs.readFileSync(path.join(dir, f), 'utf8').replace(/\s*$/, '') + '\n';
}
/* The page inlines this inside a <script type="text/plain"> and starts a
   Worker from its text; a literal </script anywhere would end that tag
   early and truncate the engine silently. */
if (out.indexOf('</script') >= 0) throw new Error('a module contains </script and cannot be inlined');
new Function(out);   /* it parses, before anyone ships it */

const dest = path.join(root, 'pixelfixer.bundle.js');
fs.writeFileSync(dest, out);
console.log('built ' + dest);
console.log(files.length + ' modules, ' + out.length + ' bytes, ' + out.split('\n').length + ' lines');
