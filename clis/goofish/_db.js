import { DatabaseSync } from 'node:sqlite';
import { EventEmitter } from 'node:events';
import fs from 'fs';
import path from 'path';
import { 
  generateDdl, 
  validateCandidate, 
  validateSellerReview, 
  validateOrder 
} from './_contract.js';

/**
 * Event emitter for push-style live queries and real-time synchronization.
 */
export const dbEmitter = new EventEmitter();
dbEmitter.setMaxListeners(100);

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

/**
 * Initialize SQLite schema from Contract DDL.
 */
export function initSchema(db) {
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
 * Enforces contract validation and emits reactive change events.
 */
export function saveCandidates(items, { keyword = '', category = '' } = {}) {
  const db = getDb();
  const now = new Date().toISOString();

  const insertCandidate = db.prepare(`
    INSERT INTO candidates (
      item_id, keyword, category, title, price, price_num, original_price,
      price_drop, publish_time, location, seller, seller_user_id,
      seller_tag, condition, guarantee, item_url, image_url,
      seller_status, seller_note, status, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(item_id) DO UPDATE SET
      keyword = COALESCE(NULLIF(excluded.keyword, ''), candidates.keyword),
      category = COALESCE(NULLIF(excluded.category, ''), candidates.category),
      title = excluded.title,
      price = excluded.price,
      price_num = excluded.price_num,
      original_price = excluded.original_price,
      price_drop = excluded.price_drop,
      publish_time = excluded.publish_time,
      location = excluded.location,
      seller = excluded.seller,
      seller_user_id = excluded.seller_user_id,
      seller_tag = excluded.seller_tag,
      condition = excluded.condition,
      guarantee = excluded.guarantee,
      item_url = excluded.item_url,
      image_url = excluded.image_url,
      status = excluded.status,
      updated_at = excluded.updated_at;
  `);

  const deleteFts = db.prepare(`DELETE FROM candidates_fts WHERE item_id = ?;`);
  const insertFts = db.prepare(`INSERT INTO candidates_fts (item_id, title, seller, keyword, category) VALUES (?, ?, ?, ?, ?);`);

  let count = 0;
  for (const raw of items) {
    if (!raw.item_id || raw.item_id === '-') continue;
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
      valid.seller_status,
      valid.seller_note,
      valid.status,
      now
    );

    deleteFts.run(valid.item_id);
    insertFts.run(valid.item_id, valid.title, valid.seller, valid.keyword, valid.category);
    count++;
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
 */
export function queryCandidates({
  category = '',
  keyword = '',
  minPrice = null,
  maxPrice = null,
  excludeGhosted = false,
  sort = 'price_asc',
  limit = 50,
} = {}) {
  const db = getDb();
  let sql = 'SELECT * FROM candidates_view WHERE 1=1';
  const params = [];

  if (category) {
    const catLower = category.toLowerCase().trim();
    let mapped = category;
    if (catLower === 'me4' || catLower === 'me 4' || catLower === 'lava4' || catLower === 'lava 4') {
      mapped = 'lava_me_4';
    } else if (catLower === 'air' || catLower === 'lava air') {
      mapped = 'lava_me_air';
    } else if (catLower === 'nexg' || catLower === 'nexg2' || catLower === '2n' || catLower === 'nylon') {
      mapped = 'nexg2_nylon';
    }
    sql += ' AND (category = ? OR category LIKE ? OR keyword LIKE ?)';
    params.push(mapped, `%${category}%`, `%${category}%`);
  }

  if (keyword) {
    sql += ' AND (title LIKE ? OR keyword LIKE ? OR seller LIKE ?)';
    const q = `%${keyword}%`;
    params.push(q, q, q);
  }

  if (minPrice !== null && minPrice !== undefined && minPrice !== '') {
    sql += ' AND price_num >= ?';
    params.push(Number(minPrice));
  }

  if (maxPrice !== null && maxPrice !== undefined && maxPrice !== '') {
    sql += ' AND price_num <= ?';
    params.push(Number(maxPrice));
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
  params.push(limit);

  return db.prepare(sql).all(...params);
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
    INSERT INTO seller_reviews (seller, status, reason, last_message, interaction_count, updated_at)
    VALUES (?, ?, ?, ?, 1, ?)
    ON CONFLICT(seller) DO UPDATE SET
      status = excluded.status,
      reason = excluded.reason,
      last_message = excluded.last_message,
      interaction_count = seller_reviews.interaction_count + 1,
      updated_at = excluded.updated_at;
  `);

  insert.run(valid.seller, valid.status, valid.reason, valid.last_message, now);

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
    const allText = [sess.last_message, ...msgs.map(m => m.content)].filter(Boolean).join(' | ');
    const sellerMsgs = msgs.filter(m => m.is_self === '否').map(m => m.content);
    const lastMsg = sess.last_message || (msgs[msgs.length - 1]?.content || '-');

    let status = 'unknown';
    let reason = '';

    const unfitRegex = /(?:没有|没有咯|已出|卖了|不在了|下架|缺货|nexg se|卖家关闭了订单|不单出|已坏|故障)/i;
    const ghostRegex = /(?:没回复说明客服可能在忙|自动回复)/;
    const responsiveRegex = /(?:全新正品|包邮|专拍价|可以发|明天发|当天发|有货|现货|在的|还在|有奶白|加振款|拿火源|标价.*拿火|\b(?:1\d{3}|2\d{3})\b)/;

    if (
      unfitRegex.test(allText) ||
      sess.trade_status === '交易关闭'
    ) {
      status = 'unfit';
      const m = allText.match(unfitRegex);
      reason = `明确无货或交易关闭: ${m ? m[0] : lastMsg}`;
    } else if (
      ghostRegex.test(allText) ||
      (msgs.length >= 1 && sellerMsgs.length === 0) ||
      (msgs.length >= 1 && sellerMsgs.every(m => m.trim() === '[微笑]' || m.trim() === '对方撤回了一条信息'))
    ) {
      status = 'ghosted';
      reason = `已读不回或仅自动回复/表情: ${lastMsg}`;
    } else if (
      responsiveRegex.test(allText)
    ) {
      status = 'responsive';
      const quote = allText.match(responsiveRegex)?.[0] || lastMsg;
      reason = `活跃报价与现货确认: ${quote}`;
    }

    if (status !== 'unknown') {
      saveSellerReview({ seller, status, reason, last_message: lastMsg });
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
