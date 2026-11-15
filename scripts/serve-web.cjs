#!/usr/bin/env node
// OWNER: A. Serves the static web export (dist-web/) with single-page-app fallback, so deep links such as
// /gallery work. Usage: `npm run preview:web` (exports first), or `node scripts/serve-web.cjs [port]`.
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', 'dist-web');
const port = Number(process.argv[2] || process.env.PORT || 4173);
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml',
};

http
  .createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    let file = path.join(root, urlPath);
    // Stay inside dist-web, and fall back to index.html for any route the files do not match.
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  })
  .listen(port, () => console.log(`Toll web preview: http://localhost:${port}/gallery`));
