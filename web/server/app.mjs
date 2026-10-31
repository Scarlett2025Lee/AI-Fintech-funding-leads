import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { dashboardStats, projectRoot } from './database.mjs';

const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

export function createApp(db, { staticRoot = join(projectRoot, 'dist') } = {}) {
  const root = resolve(staticRoot);
  return createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    // This service is private to this computer. Reject DNS-rebinding hostnames.
    const authority = req.headers.host ?? '';
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(authority)) {
      res.writeHead(403); res.end('Invalid local hostname'); return;
    }
    const json = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD'); json(405, { error: 'Method not allowed' }); return;
    }
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname === '/api/health') { json(200, { status: 'ok', database: 'connected' }); return; }
      if (url.pathname === '/api/dashboard') { json(200, dashboardStats(db)); return; }
      if (url.pathname.startsWith('/api/')) { json(404, { error: 'API route not found' }); return; }
      let pathname;
      try { pathname = decodeURIComponent(url.pathname); } catch { json(400, { error: 'Invalid URL' }); return; }
      if (pathname.includes('\\') || pathname.includes('\0')) { json(400, { error: 'Invalid path' }); return; }
      const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!file.startsWith(root + sep)) { json(403, { error: 'Forbidden' }); return; }
      try {
        const body = await readFile(file);
        res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
        res.writeHead(200, { 'Content-Type': contentTypes[extname(file)] ?? 'application/octet-stream' });
        res.end(req.method === 'HEAD' ? undefined : body);
      } catch (error) {
        if (error.code === 'ENOENT' || error.code === 'EISDIR') json(404, { error: 'Page not found. Run npm run build first.' });
        else throw error;
      }
    } catch (error) {
      console.error('Local request failed:', error.message);
      json(500, { error: 'Unable to read local workspace' });
    }
  });
}
