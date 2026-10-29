import type { IncomingMessage, ServerResponse } from 'node:http';
import { isRecord } from '../shared/protocol.js';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export function json(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(payload));
}
export async function body(req: IncomingMessage, limit = 16384): Promise<Record<string, unknown>> {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || ''))
    throw new HttpError(415, 'JSON body required.');
  if (Number(req.headers['content-length']) > limit) {
    req.resume();
    throw new HttpError(413, 'Request too large.');
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const raw of req.iterator({ destroyOnReturn: false })) {
    const part: unknown = raw;
    if (!Buffer.isBuffer(part)) throw new HttpError(400, 'Invalid body.');
    size += part.length;
    if (size > limit) {
      req.resume();
      throw new HttpError(413, 'Request too large.');
    }
    chunks.push(part);
  }
  let value: unknown;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    throw new HttpError(400, 'Invalid JSON.');
  }
  if (!isRecord(value)) throw new HttpError(400, 'Invalid JSON.');
  return value;
}
export function sameOrigin(req: IncomingMessage): boolean {
  return (
    (!req.headers.origin || req.headers.origin === `http://${req.headers.host}`) &&
    req.headers['sec-fetch-site'] !== 'cross-site'
  );
}
