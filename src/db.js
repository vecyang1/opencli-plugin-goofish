import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';

/**
 * Resolve the SQLite database path with configurable environment precedence:
 * GOOFISH_DB > GOOFISH_DATA_DIR > <cwd>/data/goofish.db
 */
export function resolveDbPath() {
  if (process.env.GOOFISH_DB) return path.resolve(process.env.GOOFISH_DB);
  const dir = process.env.GOOFISH_DATA_DIR
    ? path.resolve(process.env.GOOFISH_DATA_DIR)
    : path.resolve(process.cwd(), 'data');
  return path.join(dir, 'goofish.db');
}

const _dbCache = new Map();

export function getDb() {
  const dbFile = resolveDbPath();
  const cached = _dbCache.get(dbFile);
  if (cached) return cached;

  const dir = path.dirname(dbFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new DatabaseSync(dbFile);
  initSchema(db);
  _dbCache.set(dbFile, db);
  return db;
}

export function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      order_id TEXT PRIMARY KEY,
      seller TEXT,
      seller_user_id TEXT,
      status TEXT,
      title TEXT,
      price TEXT,
      spec_tag TEXT,
      item_id TEXT,
      order_url TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS favorites (
      item_id TEXT PRIMARY KEY,
      title TEXT,
      price TEXT,
      discount TEXT,
      status TEXT,
      item_url TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      contact_name TEXT PRIMARY KEY,
      trade_status TEXT,
      last_message TEXT,
      time TEXT,
      unread TEXT,
      has_item TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_name TEXT,
      sender TEXT,
      is_self TEXT,
      content TEXT,
      read_status TEXT,
      created_at TEXT,
      UNIQUE(contact_name, sender, content)
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS orders_fts USING fts5(
      order_id UNINDEXED,
      title,
      seller,
      spec_tag,
      status
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
      contact_name,
      sender,
      content
    );
  `);
}

/**
 * Upsert orders into SQLite and sync FTS.
 */
export function saveOrders(orders) {
  const db = getDb();
  const now = new Date().toISOString();
  const insertOrder = db.prepare(`
    INSERT INTO orders (order_id, seller, seller_user_id, status, title, price, spec_tag, item_id, order_url, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(order_id) DO UPDATE SET
      seller = excluded.seller,
      seller_user_id = excluded.seller_user_id,
      status = excluded.status,
      title = excluded.title,
      price = excluded.price,
      spec_tag = excluded.spec_tag,
      item_id = excluded.item_id,
      order_url = excluded.order_url,
      updated_at = excluded.updated_at;
  `);

  const deleteFts = db.prepare(`DELETE FROM orders_fts WHERE order_id = ?;`);
  const insertFts = db.prepare(`INSERT INTO orders_fts (order_id, title, seller, spec_tag, status) VALUES (?, ?, ?, ?, ?);`);

  let count = 0;
  for (const o of orders) {
    if (!o.order_id || o.order_id === '-') continue;
    insertOrder.run(
      o.order_id,
      o.seller || '',
      o.seller_user_id || '',
      o.status || '',
      o.title || '',
      o.price || '',
      o.spec_tag || '',
      o.item_id || '',
      o.order_url || '',
      now
    );
    deleteFts.run(o.order_id);
    insertFts.run(o.order_id, o.title || '', o.seller || '', o.spec_tag || '', o.status || '');
    count++;
  }
  return count;
}

export function queryOrders({ query = '', status = '', limit = 50 } = {}) {
  const db = getDb();
  let sql = 'SELECT * FROM orders WHERE 1=1';
  const params = [];

  if (status && status !== '全部') {
    sql += ' AND status LIKE ?';
    params.push(`%${status}%`);
  }

  if (query) {
    sql += ' AND (title LIKE ? OR seller LIKE ? OR order_id LIKE ? OR spec_tag LIKE ?)';
    const q = `%${query}%`;
    params.push(q, q, q, q);
  }

  sql += ' ORDER BY updated_at DESC LIMIT ?';
  params.push(limit);

  return db.prepare(sql).all(...params);
}

/**
 * Upsert favorites into SQLite.
 */
export function saveFavorites(items) {
  const db = getDb();
  const now = new Date().toISOString();
  const insertFav = db.prepare(`
    INSERT INTO favorites (item_id, title, price, discount, status, item_url, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(item_id) DO UPDATE SET
      title = excluded.title,
      price = excluded.price,
      discount = excluded.discount,
      status = excluded.status,
      item_url = excluded.item_url,
      updated_at = excluded.updated_at;
  `);

  let count = 0;
  for (const it of items) {
    if (!it.item_id || it.item_id === '-') continue;
    insertFav.run(
      it.item_id,
      it.title || '',
      it.price || '',
      it.discount || '',
      it.status || '',
      it.item_url || '',
      now
    );
    count++;
  }
  return count;
}

export function queryFavorites({ query = '', limit = 50 } = {}) {
  const db = getDb();
  let sql = 'SELECT * FROM favorites WHERE 1=1';
  const params = [];

  if (query) {
    sql += ' AND (title LIKE ? OR item_id LIKE ?)';
    const q = `%${query}%`;
    params.push(q, q);
  }

  sql += ' ORDER BY updated_at DESC LIMIT ?';
  params.push(limit);

  return db.prepare(sql).all(...params);
}

/**
 * Upsert sessions (inbox contacts) into SQLite.
 */
export function saveSessions(sessions) {
  const db = getDb();
  const now = new Date().toISOString();
  const insertSess = db.prepare(`
    INSERT INTO sessions (contact_name, trade_status, last_message, time, unread, has_item, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(contact_name) DO UPDATE SET
      trade_status = excluded.trade_status,
      last_message = excluded.last_message,
      time = excluded.time,
      unread = excluded.unread,
      has_item = excluded.has_item,
      updated_at = excluded.updated_at;
  `);

  let count = 0;
  for (const s of sessions) {
    if (!s.contact_name || s.contact_name === '未知联系人') continue;
    insertSess.run(
      s.contact_name,
      s.trade_status || '-',
      s.last_message || '-',
      s.time || '-',
      s.unread || '-',
      s.has_item || '-',
      now
    );
    count++;
  }
  return count;
}

export function querySessions({ query = '', limit = 50 } = {}) {
  const db = getDb();
  let sql = 'SELECT * FROM sessions WHERE 1=1';
  const params = [];

  if (query) {
    sql += ' AND (contact_name LIKE ? OR last_message LIKE ? OR trade_status LIKE ?)';
    const q = `%${query}%`;
    params.push(q, q, q);
  }

  sql += ' ORDER BY updated_at DESC LIMIT ?';
  params.push(limit);

  return db.prepare(sql).all(...params);
}

/**
 * Upsert messages into SQLite and sync messages_fts.
 */
export function saveMessages(contactName, messages) {
  const db = getDb();
  const now = new Date().toISOString();
  const insertMsg = db.prepare(`
    INSERT INTO messages (contact_name, sender, is_self, content, read_status, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(contact_name, sender, content) DO UPDATE SET
      read_status = excluded.read_status;
  `);

  const insertFts = db.prepare(`INSERT INTO messages_fts (contact_name, sender, content) VALUES (?, ?, ?);`);

  let count = 0;
  for (const m of messages) {
    if (!m.content) continue;
    try {
      insertMsg.run(
        contactName,
        m.sender || '',
        m.is_self || '否',
        m.content || '',
        m.read_status || '-',
        now
      );
      insertFts.run(contactName, m.sender || '', m.content || '');
      count++;
    } catch (e) {}
  }
  return count;
}

export function queryMessages(contactName, limit = 100) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM messages 
    WHERE contact_name = ? 
    ORDER BY id ASC 
    LIMIT ?
  `).all(contactName, limit);
}

/**
 * Global database statistics.
 */
export function getDbStats() {
  const db = getDb();
  const orderCount = db.prepare('SELECT COUNT(*) as count FROM orders').get().count;
  const favCount = db.prepare('SELECT COUNT(*) as count FROM favorites').get().count;
  const sessionCount = db.prepare('SELECT COUNT(*) as count FROM sessions').get().count;
  const msgCount = db.prepare('SELECT COUNT(*) as count FROM messages').get().count;

  const spentRow = db.prepare(`
    SELECT SUM(CAST(REPLACE(REPLACE(price, '¥', ''), '￥', '') AS REAL)) as total 
    FROM orders 
    WHERE status LIKE '%交易成功%'
  `).get();

  return {
    orders_stored: orderCount,
    favorites_stored: favCount,
    sessions_stored: sessionCount,
    messages_stored: msgCount,
    total_spent: '¥' + (spentRow.total || 0).toFixed(2),
  };
}
