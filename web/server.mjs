import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createPool } from './backend/database.mjs';
import { api } from './backend/api.mjs';

// Homologation is explicitly enabled. Default remains the isolated demonstration.
const handleApi = process.env.CENTRAL_MODE === 'homologacao' ? api(createPool()) : null;
const root = path.resolve(fileURLToPath(new URL('./public/', import.meta.url)));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf':'font/ttf' };
const server = http.createServer(async (req, res) => {
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  if(process.env.COOKIE_SECURE==='1')res.setHeader('Strict-Transport-Security','max-age=31536000');
  res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://tile.openstreetmap.org; font-src 'self'; connect-src ${handleApi ? "'self'" : "'none'"}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  if(req.url==='/healthz'&&req.method==='GET'){res.setHeader('Content-Type','application/json');return res.end('{"ok":true}');}
  if (req.url === '/mode.js') { res.setHeader('Content-Type','text/javascript'); return res.end(`export default ${JSON.stringify(handleApi?'homologacao':'demo')};`); }
  if (handleApi && await handleApi(req,res)) return;
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  try {
    const requested = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const target = path.resolve(root, '.' + (requested === '/' ? '/index.html' : requested));
    if (!target.startsWith(root + path.sep) || !types[path.extname(target)]) { res.writeHead(404); return res.end(); }
    const content = await readFile(target);
    res.setHeader('Content-Type', types[path.extname(target)]);
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch { res.writeHead(404); res.end('Não encontrado'); }
});
server.listen(Number(process.env.PORT || 4173), process.env.HOST || '127.0.0.1', () => console.log('Servidor: http://127.0.0.1:' + server.address().port));
