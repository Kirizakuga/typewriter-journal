// Typewriter Journal backend: serves the page and stores notes in SQLite.
// No dependencies; needs Node 22.5+ (node:sqlite).
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const DATA_DIR = process.env.DATA_DIR || join(ROOT, 'data');
const MAX_BODY = 20 * 1024 * 1024;

await mkdir(DATA_DIR, { recursive: true });
const db = new DatabaseSync(join(DATA_DIR, 'journal.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, parent_id TEXT,
    x REAL NOT NULL DEFAULT 0, y REAL NOT NULL DEFAULT 0, sort INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS entries (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '',
    created INTEGER NOT NULL, updated INTEGER NOT NULL, board_x REAL, board_y REAL, sort INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);

const getKv = key => { const r = db.prepare('SELECT value FROM kv WHERE key = ?').get(key); return r ? JSON.parse(r.value) : undefined; };
const setKv = db.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');

function readState() {
  const projects = db.prepare('SELECT id, name, parent_id, x, y FROM projects ORDER BY sort').all()
    .map(p => ({ id: p.id, name: p.name, parentId: p.parent_id, x: p.x, y: p.y }));
  const entries = db.prepare('SELECT * FROM entries ORDER BY sort').all()
    .map(e => ({ id: e.id, projectId: e.project_id, title: e.title, body: e.body, created: e.created, updated: e.updated, bx: e.board_x ?? undefined, by: e.board_y ?? undefined }));
  return { rev: getKv('rev') ?? 0, projects, entries, currentProject: getKv('currentProject') ?? null, settings: getKv('settings') ?? {} };
}

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v, d = '') => (typeof v === 'string' ? v : d);

function writeState(s) {
  if (!Array.isArray(s.projects) || !Array.isArray(s.entries)) throw new Error('projects and entries must be arrays');
  const insP = db.prepare('INSERT INTO projects (id, name, parent_id, x, y, sort) VALUES (?, ?, ?, ?, ?, ?)');
  const insE = db.prepare('INSERT INTO entries (id, project_id, title, body, created, updated, board_x, board_y, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const rev = (getKv('rev') ?? 0) + 1;
  db.exec('BEGIN');
  try {
    db.exec('DELETE FROM projects; DELETE FROM entries;');
    s.projects.forEach((p, i) => insP.run(str(p.id), str(p.name, 'Untitled'), p.parentId ? str(p.parentId) : null, num(p.x), num(p.y), i));
    s.entries.forEach((e, i) => insE.run(str(e.id), str(e.projectId), str(e.title), str(e.body), num(e.created, Date.now()), num(e.updated, Date.now()),
      typeof e.bx === 'number' ? e.bx : null, typeof e.by === 'number' ? e.by : null, i));
    setKv.run('currentProject', JSON.stringify(s.currentProject ?? null));
    setKv.run('settings', JSON.stringify(s.settings ?? {}));
    setKv.run('rev', JSON.stringify(rev));
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return rev;
}

const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { reject(Object.assign(new Error('body too large'), { code: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/api/state' && req.method === 'GET') return send(res, 200, readState());

    if (url.pathname === '/api/state' && (req.method === 'PUT' || req.method === 'POST')) {
      const s = JSON.parse(await readBody(req));
      const current = getKv('rev') ?? 0;
      // optimistic lock: refuse writes based on an old copy (e.g. a second tab)
      if (!s.force && s.baseRev !== current) return send(res, 409, { error: 'stale', rev: current });
      return send(res, 200, { rev: writeState(s) });
    }

    if (url.pathname === '/api/health') return send(res, 200, { ok: true });

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      return send(res, 200, await readFile(join(ROOT, 'index.html')), 'text/html; charset=utf-8');
    }
    if (req.method === 'GET' && url.pathname === '/config.js') {
      return send(res, 200, await readFile(join(ROOT, 'config.js')), 'text/javascript; charset=utf-8');
    }
    send(res, 404, { error: 'not found' });
  } catch (err) {
    send(res, err.code === 413 ? 413 : err instanceof SyntaxError ? 400 : 500, { error: err.message });
  }
}).listen(PORT, HOST, () => console.log(`Typewriter Journal on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`));
