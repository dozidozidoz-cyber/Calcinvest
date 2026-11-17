#!/usr/bin/env node
/* CalcInvest — serveur statique local (aucune dépendance).
   Équivalent de `python3 -m http.server`, avec les clean URLs de Vercel
   (/journal-trading → journal-trading.html), sans cache, et qui exécute
   les fonctions serverless de api/ (/api/daily?symbol=AAPL…).
   Usage : node scripts/dev_server.js [port]   → http://localhost:8000 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.argv[2]) || 8000;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8'
};

/** Exécute api/<nom>.js (fonction Vercel) avec un req/res minimal compatible. */
function runApi(name, req, res) {
  const file = path.join(ROOT, 'api', name + '.js');
  if (!/^[a-z0-9-]+$/.test(name) || !fs.existsSync(file)) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end('{"error":"API inconnue"}');
  }
  const url = new URL(req.url, 'http://localhost');
  req.query = Object.fromEntries(url.searchParams);
  let code = 200;
  const shim = {
    setHeader: (k, v) => res.setHeader(k, v),
    status(c) { code = c; return shim; },
    json(obj) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); return shim; }
  };
  Promise.resolve(require(file)(req, shim)).catch(e => {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  });
}

http.createServer((req, res) => {
  let rel;
  try { rel = decodeURIComponent(req.url.split('?')[0]); } catch (_) { rel = '/'; }
  const api = rel.match(/^\/api\/([^/]+?)(\.js)?$/);
  if (api) return runApi(api[1], req, res);
  if (rel === '/') rel = '/index.html';
  let file = path.join(ROOT, rel);
  if (!path.extname(file) && fs.existsSync(file + '.html')) file += '.html';
  const inside = file === ROOT || file.startsWith(ROOT + path.sep);
  if (!inside || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('404');
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, '127.0.0.1', () => console.log('CalcInvest → http://localhost:' + PORT));
