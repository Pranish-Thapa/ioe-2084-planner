/**
 * Zero-dependency static file server.
 *
 * The app itself is plain ES modules, which browsers refuse to load over
 * file:// because of CORS. This exists only so you can open it locally:
 *
 *     npm start
 *
 * It serves the project directory and nothing else. It binds to localhost.
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const PORT = Number(process.env.PORT) || 5173;
const HOST = process.env.HOST || '127.0.0.1';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || rel === '') rel = '/index.html';

    // Contain the path inside ROOT. `normalize` collapses ".." before we join.
    const target = normalize(join(ROOT, rel));
    if (target !== ROOT && !target.startsWith(ROOT + sep)) {
      res.writeHead(403, { 'content-type': 'text/plain' });
      res.end('403 Forbidden');
      return;
    }

    let info = null;
    try {
      info = await stat(target);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(`404 Not found: ${rel}`);
      return;
    }

    if (info.isDirectory()) {
      res.writeHead(302, { location: `${rel.replace(/\/$/, '')}/index.html` });
      res.end();
      return;
    }

    const body = await readFile(target);
    res.writeHead(200, {
      'content-type': TYPES[extname(target).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-cache',
      'content-length': body.length,
    });
    res.end(body);
  } catch (err) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(`500 ${err.message}`);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n  IOE 2084 Planner`);
  console.log(`  --------------------`);
  console.log(`  running at  http://${HOST}:${PORT}`);
  console.log(`  serving     ${ROOT}`);
  console.log(`\n  Press Ctrl+C to stop.\n`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log('\n  Stopping.');
    server.close(() => process.exit(0));
  });
}
