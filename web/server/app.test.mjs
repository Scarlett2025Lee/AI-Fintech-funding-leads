import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase, dashboardStats, dataDirectory, projectRoot } from './database.mjs';
import { createApp } from './app.mjs';
import { request } from 'node:http';

test('migration retains data after restart and counts only due and active records', () => {
  const directory = mkdtempSync(join(tmpdir(), 'signal-db-'));
  const filename = join(directory, 'data/signal.sqlite3');
  let db;
  try {
    db = openDatabase(filename);
    db.exec(`INSERT INTO companies(id,name) VALUES (1,'Example');
      INSERT INTO contacts(id,company_id,name) VALUES (1,1,'Founder');
      INSERT INTO outreach(id,company_id,contact_id,status) VALUES (1,1,1,'contacted'), (2,1,1,'closed');
      INSERT INTO follow_ups(outreach_id,due_at) VALUES (1,'2000-01-01T00:00:00Z'), (1,'2999-01-01T00:00:00Z');`);
    assert.throws(() => db.exec("INSERT INTO contacts(company_id,name) VALUES (99,'Orphan')"));
    assert.throws(() => db.exec("UPDATE outreach SET status='invalid' WHERE id=1"));
    db.close(); db = openDatabase(filename);
    assert.deepEqual({ ...dashboardStats(db) }, { companies: 1, funding_rounds: 0, contacts: 1, active_outreach: 1, due_follow_ups: 1 });
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 1);
  } finally { db?.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('future database versions and relative data paths are rejected', () => {
  const directory = mkdtempSync(join(tmpdir(), 'signal-newer-'));
  const filename = join(directory, 'signal.sqlite3');
  try {
    const db = new DatabaseSync(filename); db.exec('PRAGMA user_version=2'); db.close();
    assert.throws(() => openDatabase(filename), /newer/);
    assert.equal(dataDirectory(undefined), join(projectRoot, 'data'));
    assert.equal(dataDirectory(directory), directory);
    for (const relative of ['', 'data', '../data']) assert.throws(() => dataDirectory(relative), /absolute/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('HTTP serves the site and SQLite counts, without exposing the database or source', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'signal-http-'));
  writeFileSync(join(directory, 'index.html'), '<!doctype html><h1>Signal</h1>');
  const db = openDatabase(':memory:');
  const server = createApp(db, { staticRoot: directory });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); rmSync(directory, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const page = await fetch(base); assert.match(await page.text(), /Signal/);
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal((await fetch(base + '/api/health')).status, 200);
  db.exec("INSERT INTO companies(name) VALUES ('Saved company')");
  assert.equal((await fetch(base + '/api/dashboard').then(r => r.json())).companies, 1);
  for (const path of ['/data/signal.sqlite3', '/server/database.mjs', '/api/unknown', '/%2e%2e%2fpackage.json']) {
    const response = await fetch(base + path);
    assert.ok([403, 404].includes(response.status), path);
  }
  assert.equal((await fetch(base, { method: 'POST' })).status, 405);
  const untrustedStatus = await new Promise((resolve, reject) => {
    const req = request(base + '/api/dashboard', { headers: { Host: 'untrusted.example' } }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject); req.end();
  });
  assert.equal(untrustedStatus, 403);
});
