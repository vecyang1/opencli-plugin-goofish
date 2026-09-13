import { DatabaseSync } from 'node:sqlite';
import { EventEmitter } from 'node:events';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { 
  SCHEMA_CONTRACT,
  generateDdl, 
  validateCandidate, 
  validateSellerReview, 
  validateOrder,
  isAccessoryTitle,
  inferCategory,
  classifySellerCommunication
} from './_contract.js';

/**
 * Event emitter for push-style live queries and real-time synchronization.
 */
export const dbEmitter = new EventEmitter();
dbEmitter.setMaxListeners(100);

/**
 * Resolve the SQLite database path with configurable environment precedence:
 * 1. GOOFISH_DB environment variable
 * 2. GOOFISH_DATA_DIR environment variable
 * 3. User SSOT (~/data/goofish.db) if ~/data directory exists
 * 4. Local workspace data directory (<cwd>/data/goofish.db)
 */
export function resolveDbPath() {
  if (process.env.GOOFISH_DB) return path.resolve(process.env.GOOFISH_DB);
  if (process.env.GOOFISH_DATA_DIR) {
    return path.join(path.resolve(process.env.GOOFISH_DATA_DIR), 'goofish.db');
  }
  const homeDataDir = path.join(os.homedir(), 'data');
  const homeDbPath = path.join(homeDataDir, 'goofish.db');
  if (fs.existsSync(homeDbPath) || fs.existsSync(homeDataDir)) {
    return homeDbPath;
  }
  const dir = path.resolve(process.cwd(), 'data');
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

/**
 * Initialize SQLite schema from Contract DDL.
 * Configures WAL mode and busy timeout for non-blocking concurrency.
 */
export function initSchema(db) {
  try {
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA busy_timeout = 5000;');
    db.exec('PRAGMA synchronous = NORMAL;');
  } catch (e) {}

  // Migrate existing seller_reviews table if seller_user_id column is missing
  try {
    const cols = db.prepare("PRAGMA table_info('seller_reviews');").all();
    if (cols.length > 0 && !cols.some(c => c.name === 'seller_user_id')) {
      db.exec("ALTER TABLE seller_reviews ADD COLUMN seller_user_id TEXT DEFAULT '';");
    }
  } catch (e) {}

  // Migrate existing candidates table if images or defect_notes columns are missing
  try {
    const cCols = db.prepare("PRAGMA table_info('candidates');").all();
    if (cCols.length > 0) {
      if (!cCols.some(c => c.name === 'images')) {
        db.exec("ALTER TABLE candidates ADD COLUMN images TEXT DEFAULT '';");
      }
      if (!cCols.some(c => c.name === 'defect_notes')) {
        db.exec("ALTER TABLE candidates ADD COLUMN defect_notes TEXT DEFAULT '';");
      }
    }
  } catch (e) {}


  // Drop views before recreating so view definitions always stay synchronized with SCHEMA_CONTRACT
  for (const viewName of Object.keys(SCHEMA_CONTRACT.views)) {
    try {
      db.exec(`DROP VIEW IF EXISTS ${viewName};`);
    } catch (e) {}
  }

  const ddlStatements = generateDdl();
  for (const ddl of ddlStatements) {
    db.exec(ddl);
  }
}

/**
 * Subscribe to a live query.
 * Unidirectional Data Flow & Push-Style Realtime Sync:
 * - Immediately executes queryFn and pushes the current snapshot.
 * - Whenever mutations occur on specified tables, re-evaluates queryFn and pushes the fresh result.
 * 
 * @param {Object} options
 * @param {string[]} [options.tables] - Tables to listen to (e.g. ['candidates', 'seller_reviews'])
 * @param {Function} options.queryFn - Function querying SQLite SSOT
 * @param {Function} options.onChange - Callback (freshData, eventPayload)
 * @returns {{ unsubscribe: Function, getCurrent: Function }}
 */
export function subscribeLiveQuery({ tables = [], queryFn, onChange }) {
  if (typeof queryFn !== 'function') throw new TypeError('queryFn must be a function');
  if (typeof onChange !== 'function') throw new TypeError('onChange must be a function');

  let current = queryFn();
  try {
    onChange(current, { initial: true });
  } catch (err) {
    console.error('Error in initial live query invocation:', err);
  }

  const listener = (event) => {
    try {
      current = queryFn();
      onChange(current, event);
    } catch (err) {
      console.error('Error in live query update:', err);
    }
  };

  const registeredEvents = [];
  if (tables.length === 0) {
    dbEmitter.on('change', listener);
    registeredEvents.push(['change', listener]);
  } else {
    for (const t of tables) {
      const evt = `table:${t}`;
      dbEmitter.on(evt, listener);
      registeredEvents.push([evt, listener]);
    }
  }

  return {
    getCurrent: () => current,
    unsubscribe: () => {
      for (const [evt, fn] of registeredEvents) {
        dbEmitter.off(evt, fn);
      }
    },
  };
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
  db.exec('BEGIN TRANSACTION;');
  try {
    for (const raw of orders) {
      if (!raw.order_id || raw.order_id === '-') continue;
      let o;
      try {
        o = validateOrder(raw);
      } catch (e) {
        continue;
      }

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
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  if (count > 0) {
    dbEmitter.emit('table:orders', { count, action: 'upsert' });
    dbEmitter.emit('change', { table: 'orders', count, action: 'upsert' });
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
  db.exec('BEGIN TRANSACTION;');
  try {
    for (const it of items) {
      if (!it.item_id || it.item_id === '-') continue;
      insertFav.run(
        String(it.item_id).trim(),
        it.title || '',
        it.price || '',
        it.discount || '',
        it.status || '',
        it.item_url || '',
        now
      );
      count++;
    }
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  if (count > 0) {
    dbEmitter.emit('table:favorites', { count, action: 'upsert' });
    dbEmitter.emit('change', { table: 'favorites', count, action: 'upsert' });
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
  db.exec('BEGIN TRANSACTION;');
  try {
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
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  if (count > 0) {
    dbEmitter.emit('table:sessions', { count, action: 'upsert' });
    dbEmitter.emit('change', { table: 'sessions', count, action: 'upsert' });
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

  const deleteFts = db.prepare(`DELETE FROM messages_fts WHERE contact_name = ? AND sender = ? AND content = ?;`);
  const insertFts = db.prepare(`INSERT INTO messages_fts (contact_name, sender, content) VALUES (?, ?, ?);`);

  let count = 0;
  db.exec('BEGIN TRANSACTION;');
  try {
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
        deleteFts.run(contactName, m.sender || '', m.content || '');
        insertFts.run(contactName, m.sender || '', m.content || '');
        count++;
      } catch (e) {}
    }
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  if (count > 0) {
    dbEmitter.emit('table:messages', { contact: contactName, count, action: 'upsert' });
    dbEmitter.emit('change', { table: 'messages', contact: contactName, count, action: 'upsert' });
  }

  return count;
}

export function queryMessages(contactOrOpts, maybeOpts = {}) {
  const db = getDb();
  let contactName = '';
  let limit = 100;
  let query = '';

  if (typeof contactOrOpts === 'string') {
    contactName = contactOrOpts;
    if (typeof maybeOpts === 'number') {
      limit = maybeOpts;
    } else if (maybeOpts && typeof maybeOpts === 'object') {
      limit = maybeOpts.limit || 100;
      query = maybeOpts.query || '';
    }
  } else if (contactOrOpts && typeof contactOrOpts === 'object') {
    contactName = contactOrOpts.contactName || contactOrOpts.contact_name || '';
    limit = contactOrOpts.limit || 100;
    query = contactOrOpts.query || '';
  }

  let sql = 'SELECT * FROM messages WHERE 1=1';
  const params = [];

  if (contactName) {
    sql += ' AND contact_name = ?';
    params.push(contactName);
  }

  if (query) {
    sql += ' AND (content LIKE ? OR sender LIKE ?)';
    params.push(`%${query}%`, `%${query}%`);
  }

  sql += ' ORDER BY id ASC LIMIT ?';
  params.push(limit);

  return db.prepare(sql).all(...params);
}

/**
 * Upsert candidates into SQLite SSOT.
 * Enforces contract validation, accessory exclusion, and emits reactive change events.
 */
export function saveCandidates(items, { keyword = '', category = '', filterAccessories = true } = {}) {
  const db = getDb();
  const now = new Date().toISOString();

  const insertCandidate = db.prepare(`
    INSERT INTO candidates (
      item_id, keyword, category, title, price, price_num, original_price,
      price_drop, publish_time, location, seller, seller_user_id,
      seller_tag, condition, guarantee, item_url, image_url,
      images, defect_notes,
      seller_status, seller_note, status, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(item_id) DO UPDATE SET
      keyword = COALESCE(NULLIF(excluded.keyword, ''), candidates.keyword),
      category = CASE WHEN excluded.category != 'other' AND excluded.category != '' THEN excluded.category ELSE candidates.category END,
      title = CASE WHEN excluded.title != '闲鱼商品' AND excluded.title != '' THEN excluded.title ELSE candidates.title END,
      price = CASE WHEN excluded.price != '¥0' AND excluded.price != '' THEN excluded.price ELSE candidates.price END,
      price_num = CASE WHEN excluded.price_num > 0 THEN excluded.price_num ELSE candidates.price_num END,
      original_price = COALESCE(NULLIF(excluded.original_price, '-'), candidates.original_price),
      price_drop = COALESCE(NULLIF(excluded.price_drop, '-'), candidates.price_drop),
      publish_time = COALESCE(NULLIF(excluded.publish_time, '-'), candidates.publish_time),
      location = COALESCE(NULLIF(excluded.location, '-'), candidates.location),
      seller = CASE WHEN excluded.seller != '闲鱼卖家' AND excluded.seller != '-' AND excluded.seller != '' THEN excluded.seller ELSE candidates.seller END,
      seller_user_id = COALESCE(NULLIF(excluded.seller_user_id, '-'), candidates.seller_user_id),
      seller_tag = COALESCE(NULLIF(excluded.seller_tag, '-'), candidates.seller_tag),
      condition = COALESCE(NULLIF(excluded.condition, '-'), candidates.condition),
      guarantee = COALESCE(NULLIF(excluded.guarantee, '普通'), candidates.guarantee),
      item_url = excluded.item_url,
      image_url = COALESCE(NULLIF(excluded.image_url, ''), candidates.image_url),
      images = COALESCE(NULLIF(excluded.images, ''), candidates.images),
      defect_notes = COALESCE(NULLIF(excluded.defect_notes, ''), candidates.defect_notes),
      status = excluded.status,
      updated_at = excluded.updated_at;
  `);

  const deleteFts = db.prepare(`DELETE FROM candidates_fts WHERE item_id = ?;`);
  const insertFts = db.prepare(`INSERT INTO candidates_fts (item_id, title, seller, keyword, category) VALUES (?, ?, ?, ?, ?);`);

  let count = 0;
  db.exec('BEGIN TRANSACTION;');
  try {
    for (const raw of items) {
      if (!raw.item_id || raw.item_id === '-') continue;

      // Filter out accessories before writing to SSOT
      if (filterAccessories && isAccessoryTitle(raw.title, category || raw.category)) {
        continue;
      }

      let valid;
      try {
        valid = validateCandidate({
          ...raw,
          keyword: keyword || raw.keyword,
          category: category || raw.category,
        });
      } catch (e) {
        continue;
      }

      // Sanity check: reject invalid zero/negative price items or items under category price floor
      if (filterAccessories) {
        if (valid.price_num <= 0) {
          continue;
        }
        if (valid.price_num < 400 && ['nexg2_nylon', 'lava_me_air', 'lava_me_4'].includes(valid.category)) {
          continue;
        }
        if (valid.price_num < 60 && valid.category === 'ugreen_hub') {
          continue;
        }
      }

      insertCandidate.run(
        valid.item_id,
        valid.keyword,
        valid.category,
        valid.title,
        valid.price,
        valid.price_num,
        valid.original_price,
        valid.price_drop,
        valid.publish_time,
        valid.location,
        valid.seller,
        valid.seller_user_id,
        valid.seller_tag,
        valid.condition,
        valid.guarantee,
        valid.item_url,
        valid.image_url,
        valid.images,
        valid.defect_notes,
        valid.seller_status,
        valid.seller_note,
        valid.status,
        now
      );

      deleteFts.run(valid.item_id);
      insertFts.run(valid.item_id, valid.title, valid.seller, valid.keyword, valid.category);
      count++;
    }
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  if (count > 0) {
    dbEmitter.emit('table:candidates', { count, action: 'upsert' });
    dbEmitter.emit('change', { table: 'candidates', count, action: 'upsert' });
  }

  return count;
}

/**
 * Query candidates from authoritative SSOT projection (candidates_view).
 * Joins seller_reviews dynamically so that seller reputation changes are instantly reflected.
 * Correctly handles 'all' / '全部' / empty category without dropping records.
 */
export function queryCandidates({
  category = '',
  keyword = '',
  minPrice = null,
  maxPrice = null,
  excludeGhosted = false,
  excludeAccessories = true,
  sort = 'price_asc',
  limit = 50,
} = {}) {
  const db = getDb();
  let sql = 'SELECT * FROM candidates_view WHERE 1=1';
  const params = [];

  const catTrim = String(category || '').trim();
  const catLower = catTrim.toLowerCase();

  // If category is not 'all', '全部', or empty, apply category filter
  if (catTrim && catLower !== 'all' && catLower !== '全部') {
    let mapped = inferCategory({ category: catTrim });
    if (mapped === 'other' && catTrim) {
      mapped = catTrim;
    }
    sql += ' AND (category = ? OR category LIKE ? OR keyword LIKE ?)';
    params.push(mapped, `%${catTrim}%`, `%${catTrim}%`);
  }

  if (keyword) {
    sql += ' AND (title LIKE ? OR keyword LIKE ? OR seller LIKE ?)';
    const q = `%${keyword}%`;
    params.push(q, q, q);
  }

  if (minPrice !== null && minPrice !== undefined && minPrice !== '') {
    const numMin = typeof minPrice === 'number' ? minPrice : parseFloat(String(minPrice).replace(/[^\d.]/g, ''));
    if (!Number.isNaN(numMin)) {
      sql += ' AND price_num >= ?';
      params.push(numMin);
    }
  } else {
    sql += ' AND price_num > 0';
  }

  if (maxPrice !== null && maxPrice !== undefined && maxPrice !== '') {
    const numMax = typeof maxPrice === 'number' ? maxPrice : parseFloat(String(maxPrice).replace(/[^\d.]/g, ''));
    if (!Number.isNaN(numMax)) {
      sql += ' AND price_num <= ?';
      params.push(numMax);
    }
  }

  if (excludeGhosted) {
    sql += " AND seller_status NOT IN ('ghosted', 'unfit')";
  }

  if (sort === 'price_asc') {
    sql += ' ORDER BY price_num ASC, updated_at DESC';
  } else if (sort === 'price_desc') {
    sql += ' ORDER BY price_num DESC, updated_at DESC';
  } else {
    sql += ' ORDER BY updated_at DESC';
  }

  sql += ' LIMIT ?';
  params.push(limit * 2);

  const rows = db.prepare(sql).all(...params);

  let filtered = rows;
  if (excludeAccessories) {
    filtered = rows.filter(r => !isAccessoryTitle(r.title, r.category));
  }

  return filtered.slice(0, limit);
}

/**
 * Purge junk non-guitar accessories and invalid low-price items from candidates table.
 */
export function purgeJunkCandidates() {
  const db = getDb();
  const all = db.prepare('SELECT item_id, title, category, price_num FROM candidates').all();
  let purged = 0;
  const deleteCand = db.prepare('DELETE FROM candidates WHERE item_id = ?');
  const deleteFts = db.prepare('DELETE FROM candidates_fts WHERE item_id = ?');

  db.exec('BEGIN TRANSACTION;');
  try {
    for (const it of all) {
      const isJunk = isAccessoryTitle(it.title, it.category) || 
        it.price_num <= 0 ||
        (it.price_num < 400 && ['nexg2_nylon', 'lava_me_air', 'lava_me_4'].includes(it.category)) ||
        (it.price_num < 60 && it.category === 'ugreen_hub');
      if (isJunk) {
        deleteCand.run(it.item_id);
        try { deleteFts.run(it.item_id); } catch (e) {}
        purged++;
      }
    }
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  if (purged > 0) {
    dbEmitter.emit('table:candidates', { count: purged, action: 'purge' });
    dbEmitter.emit('change', { table: 'candidates', count: purged, action: 'purge' });
  }

  return purged;
}

/**
 * Upsert seller review / reputation into SQLite SSOT.
 * Zero Redundant State: seller_reviews is the single source of truth.
 * candidates_view automatically projects status and reason without requiring manual updates to candidates table.
 */
export function saveSellerReview(reviewData) {
  const valid = validateSellerReview(reviewData);
  const db = getDb();
  const now = valid.updated_at || new Date().toISOString();

  const insert = db.prepare(`
    INSERT INTO seller_reviews (seller, seller_user_id, status, reason, last_message, interaction_count, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, ?)
    ON CONFLICT(seller) DO UPDATE SET
      seller_user_id = COALESCE(NULLIF(excluded.seller_user_id, ''), seller_reviews.seller_user_id),
      status = excluded.status,
      reason = excluded.reason,
      last_message = excluded.last_message,
      interaction_count = seller_reviews.interaction_count + 1,
      updated_at = excluded.updated_at;
  `);

  insert.run(valid.seller, valid.seller_user_id || '', valid.status, valid.reason, valid.last_message, now);

  dbEmitter.emit('table:seller_reviews', { action: 'upsert', seller: valid.seller, status: valid.status });
  dbEmitter.emit('change', { table: 'seller_reviews', action: 'upsert', seller: valid.seller });
}

export function getSellerReview(seller) {
  const db = getDb();
  return db.prepare('SELECT * FROM seller_reviews WHERE seller = ?').get(seller) || null;
}

export function querySellerReviews({ status = '', limit = 50 } = {}) {
  const db = getDb();
  if (status) {
    return db.prepare('SELECT * FROM seller_reviews WHERE status = ? ORDER BY updated_at DESC LIMIT ?').all(status, limit);
  }
  return db.prepare('SELECT * FROM seller_reviews ORDER BY updated_at DESC LIMIT ?').all(limit);
}

/**
 * Automatically inspect recent chat records and session logs to classify sellers into:
 * - 'ghosted': automated reply only, never responded, or left chat unanswered
 * - 'unfit': explicitly stated no stock ("没有", "只有se"), or trade was closed/canceled
 * - 'responsive': gave active quote or verified stock ("1980全新", "air1998", "是的全新正品")
 */
export function syncSellerReviewsFromSessionsAndMessages() {
  const db = getDb();
  const sessions = db.prepare('SELECT * FROM sessions').all();
  let count = 0;

  for (const sess of sessions) {
    const seller = sess.contact_name;
    if (!seller || seller === '-' || seller === '未知联系人') continue;

    const msgs = db.prepare('SELECT * FROM messages WHERE contact_name = ? ORDER BY id ASC').all(seller);

    // Look up seller_user_id from orders or candidates if available
    let sellerUserId = '';
    const orderMatch = db.prepare("SELECT seller_user_id FROM orders WHERE seller = ? AND seller_user_id != '' LIMIT 1").get(seller);
    if (orderMatch) {
      sellerUserId = orderMatch.seller_user_id;
    } else {
      const candMatch = db.prepare("SELECT seller_user_id FROM candidates WHERE seller = ? AND seller_user_id != '' AND seller_user_id != '-' LIMIT 1").get(seller);
      if (candMatch) sellerUserId = candMatch.seller_user_id;
    }

    const review = classifySellerCommunication({ session: sess, messages: msgs });

    if (review.status !== 'unknown') {
      saveSellerReview({
        seller: review.seller,
        seller_user_id: sellerUserId,
        status: review.status,
        reason: review.reason,
        last_message: review.last_message,
      });
      count++;
    }
  }

  return count;
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
  const candidateCount = db.prepare('SELECT COUNT(*) as count FROM candidates').get().count;
  const reviewCount = db.prepare('SELECT COUNT(*) as count FROM seller_reviews').get().count;

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
    candidates_stored: candidateCount,
    seller_reviews_stored: reviewCount,
    total_spent: '¥' + (spentRow.total || 0).toFixed(2),
  };
}
