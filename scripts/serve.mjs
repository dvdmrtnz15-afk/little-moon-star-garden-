import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await import('./build.mjs');
const dir = path.join(root, 'dist');
const port = Number(process.env.PORT || 4173);
const types = { '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json' };
http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const filename = path.resolve(dir, relative);
    if (!filename.startsWith(dir + path.sep)) { response.writeHead(403).end(); return; }
    if (!(await stat(filename)).isFile()) throw new Error('not a file');
    response.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' });
    response.end(await readFile(filename));
  } catch { response.writeHead(404, { 'Content-Type':'text/plain' }).end('Not found'); }
}).listen(port, '0.0.0.0', () => console.log(`Little Moon is ready at http://localhost:${port}`));
