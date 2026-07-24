// Local dev server. Mounts the api/*.js serverless handlers and serves the built site,
// so the whole app runs offline for testing and screenshots. NOT deployed (Vercel only
// treats files under api/ as functions). In production each handler runs on its own.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

function serveFile(res, filePath) {
  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.statusCode = 404; res.end('not found'); return; }
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // API routes -> serverless handlers
  if (pathname.startsWith('/api/')) {
    const name = pathname.replace('/api/', '').replace(/\/$/, '');
    const file = path.join(__dirname, 'api', `${name}.js`);
    if (!fs.existsSync(file)) { res.statusCode = 404; res.end(JSON.stringify({ error: 'no route' })); return; }

    // parse query + body to mimic Vercel
    req.query = Object.fromEntries(url.searchParams.entries());
    if (['POST', 'PATCH', 'PUT'].includes(req.method)) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const raw = Buffer.concat(chunks).toString('utf8');
      try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = {}; }
    }
    // Vercel-style response helpers (Vercel provides these in prod)
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (o) => { res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(o)); return res; };
    try {
      const mod = await import(pathToFileURL(file).href + `?t=${Date.now()}`);
      await mod.default(req, res);
    } catch (err) {
      console.error(err);
      res.statusCode = 500; res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Static: try dist, then public
  let rel = pathname === '/' ? '/index.html' : pathname;
  if (rel === '/site' || rel === '/site/') rel = '/site.html';
  if (rel === '/dashboard') rel = '/index.html';
  const distPath = path.join(__dirname, 'dist', rel);
  const publicPath = path.join(__dirname, 'public', rel);
  if (fs.existsSync(distPath) && fs.statSync(distPath).isFile()) return serveFile(res, distPath);
  if (fs.existsSync(publicPath) && fs.statSync(publicPath).isFile()) return serveFile(res, publicPath);

  // SPA fallback
  const indexPath = path.join(__dirname, 'dist', 'index.html');
  if (fs.existsSync(indexPath)) return serveFile(res, indexPath);
  res.statusCode = 404; res.end('not found');
});

server.listen(PORT, () => console.log(`[dev] http://localhost:${PORT}`));
