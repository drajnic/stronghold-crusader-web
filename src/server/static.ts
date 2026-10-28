import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, resolve } from 'node:path';

const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};
/** Serve only the production client's generated index/assets, never source or work files. */
export async function serveStatic(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  root: string,
): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    res.end();
    return;
  }
  const path = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  if (path !== '/index.html' && !/^\/assets\/[a-zA-Z0-9_.-]+\.(js|css|svg|woff2)$/.test(path)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  try {
    const data = await readFile(resolve(root, '.' + path));
    res.writeHead(200, {
      'Content-Type': contentTypes[extname(path)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}
