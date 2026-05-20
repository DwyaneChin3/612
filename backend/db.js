const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || './data.db';
const db = new Database(path.resolve(__dirname, dbPath));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS letters (
    id INTEGER PRIMARY KEY,
    content TEXT NOT NULL DEFAULT '',
    media_url TEXT,
    media_type TEXT,
    date TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS milestones (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    date TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    media_url TEXT,
    media_type TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS moments (
    id INTEGER PRIMARY KEY,
    content TEXT NOT NULL DEFAULT '',
    media_url TEXT,
    media_type TEXT,
    date TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY,
    author TEXT,
    content TEXT NOT NULL,
    media_url TEXT,
    media_type TEXT,
    date TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

const seed = db.prepare('INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)');
seed.run('start_date', '2024-01-01');

function rowToItem(row) {
  if (!row) return null;
  return {
    id: row.id,
    content: row.content || '',
    title: row.title,
    author: row.author,
    date: row.date,
    media: row.media_url || null,
    mediaType: row.media_type || null,
  };
}

function listAll(table) {
  return db.prepare(`SELECT * FROM ${table} ORDER BY created_at ASC`).all().map(rowToItem);
}

function insert(table, fields) {
  const id = Date.now();
  const createdAt = id;
  const cols = ['id', ...Object.keys(fields), 'created_at'];
  const placeholders = cols.map(() => '?').join(', ');
  const values = [id, ...Object.values(fields), createdAt];
  db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`).run(...values);
  return rowToItem(db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id));
}

function update(table, id, fields) {
  const sets = Object.keys(fields).map(k => `${k} = ?`).join(', ');
  const values = [...Object.values(fields), id];
  const result = db.prepare(`UPDATE ${table} SET ${sets} WHERE id = ?`).run(...values);
  if (result.changes === 0) return null;
  return rowToItem(db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id));
}

function remove(table, id) {
  return db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id).changes > 0;
}

function getConfig(key) {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setConfig(key, value) {
  db.prepare('INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

module.exports = { listAll, insert, update, remove, getConfig, setConfig };
