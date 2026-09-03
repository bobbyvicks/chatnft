/* A static server for the test suite and for looking at the page locally.
   No dependencies, because adding one to serve a single HTML file is silly.

     node tools/serve.cjs . 5771

   The escape check compares two ABSOLUTE paths. It used to join the raw
   argument - path.join('.', '/index.html') is 'index.html' - and compare that
   against path.resolve(ROOT), which is absolute, so a relative root refused
   every request with a 403. It only ever worked because the first caller
   happened to pass an absolute path, and the test suite that passed '.' spent
   its first run testing a page that had never loaded. */
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.resolve(process.argv[2] || '.');
const PORT = +process.argv[3] || 5771;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
};

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.resolve(ROOT, '.' + p);
  /* Both sides absolute, and the separator matters: without it "/rootabc"
     passes a startsWith("/root") test that it should fail. */
  if (f !== ROOT && !f.startsWith(ROOT + path.sep)) {
    res.writeHead(403); return res.end('outside the served directory');
  }
  fs.readFile(f, (e, b) => {
    if (e) { res.writeHead(404); return res.end('not found: ' + p); }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(b);
  });
}).listen(PORT, () => console.log('serving ' + ROOT + ' on http://127.0.0.1:' + PORT));
