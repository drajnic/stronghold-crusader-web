import { fileURLToPath } from 'node:url';
import { createServer } from './host.js';

const development = process.argv.includes('--dev');
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT) || (development ? 4174 : 4173);
const app = createServer({ staticRoot: fileURLToPath(new URL('../client/', import.meta.url)) });
await app.listen({ host, port });
console.log(`Stronghold Crusader authoritative host: http://${host}:${port}`);
let stopping = false;
const stop = (): void => {
  if (stopping) return;
  stopping = true;
  void app.close().then(
    () => process.exit(0),
    () => process.exit(1),
  );
};
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
