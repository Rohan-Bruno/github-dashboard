#!/usr/bin/env node
// Static server for the dashboard. Node built-ins only.  node serve.mjs [port]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';

const PORT = +(process.argv[2] || process.env.PORT || 8731);
const ROOT = import.meta.dirname;
const TYPES = { '.html': 'text/html', '.json': 'application/json', '.js': 'text/javascript',
                '.css': 'text/css', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

createServer(async (req, res) => {
  const rel = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  const file = join(ROOT, rel === '/' || rel === '\\' ? 'index.html' : rel);
  if (!file.startsWith(ROOT)) return res.writeHead(403).end('forbidden');
  try {
    const body = await readFile(file);
    // data.json changes under the page; never let a browser cache a stale refresh
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream',
                         'cache-control': 'no-store' }).end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
  }
}).listen(PORT, () => console.log(`dashboard on http://localhost:${PORT}`));
