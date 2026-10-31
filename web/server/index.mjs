import { openDatabase, dataDirectory } from './database.mjs';
import { createApp } from './app.mjs';

const port = Number(process.env.SIGNAL_PORT ?? 1421);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SIGNAL_PORT must be a port number.');
const db = openDatabase();
const server = createApp(db);
server.on('error', error => { console.error(error.message); db.close(); process.exit(1); });
server.listen(port, '127.0.0.1', () => {
  console.log(`Signal website: http://127.0.0.1:${port}`);
  console.log(`Local data: ${dataDirectory()}`);
});
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  server.close(() => { db.close(); process.exit(0); });
  server.closeIdleConnections();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
