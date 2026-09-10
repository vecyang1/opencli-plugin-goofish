/**
 * Goofish (闲鱼) Architecture Contract & Type Safety Definition
 * 
 * Principles:
 * 1. Single Source of Truth (SSOT): Schema is the authoritative contract.
 * 2. Contract-First: DDL is generated from SCHEMA_CONTRACT, not hardcoded strings.
 * 3. End-to-End Type Safety: Runtime validators enforce typed constraints before DB writes.
 * 4. Zero Redundant State ("能派生的不要存"):
 *    - seller_reviews is the SSOT for seller reputation.
 *    - candidates_view joins seller_reviews dynamically; candidate records do not duplicate seller review state.
 *    - price_num is parsed/derived from price.
 */

export const SCHEMA_CONTRACT = {
  tables: {
    orders: {
      tableName: 'orders',
      primaryKey: ['order_id'],
      columns: {
        order_id: { type: 'TEXT', notNull: true, description: '闲鱼订单号' },
        seller: { type: 'TEXT', default: '', description: '卖家昵称' },
        seller_user_id: { type: 'TEXT', default: '', description: '卖家用户ID' },
        status: { type: 'TEXT', default: '', description: '交易状态 (如 交易成功/等待卖家发货)' },
        title: { type: 'TEXT', default: '', description: '商品标题' },
        price: { type: 'TEXT', default: '', description: '实付款金额字符串 (如 ¥1980.00)' },
        spec_tag: { type: 'TEXT', default: '', description: '商品规格分类' },
        item_id: { type: 'TEXT', default: '', description: '关联商品ID' },
        order_url: { type: 'TEXT', default: '', description: '订单详情URL' },
        updated_at: { type: 'TEXT', notNull: true, description: '记录同步更新时间 (ISO)' },
      },
    },

    favorites: {
      tableName: 'favorites',
      primaryKey: ['item_id'],
      columns: {
        item_id: { type: 'TEXT', notNull: true, description: '商品ID' },
        title: { type: 'TEXT', default: '', description: '商品标题' },
        price: { type: 'TEXT', default: '', description: '当前售价' },
        discount: { type: 'TEXT', default: '', description: '降价标识 (如 降¥200)' },
        status: { type: 'TEXT', default: '', description: '在售/已失效' },
        item_url: { type: 'TEXT', default: '', description: '商品URL' },
        updated_at: { type: 'TEXT', notNull: true, description: '更新时间 (ISO)' },
      },
    },

    sessions: {
      tableName: 'sessions',
      primaryKey: ['contact_name'],
      columns: {
        contact_name: { type: 'TEXT', notNull: true, description: '私信联系人昵称' },
        trade_status: { type: 'TEXT', default: '-', description: '最近交易状态' },
        last_message: { type: 'TEXT', default: '-', description: '最新消息摘要' },
        time: { type: 'TEXT', default: '-', description: '最新消息时间戳' },
        unread: { type: 'TEXT', default: '-', description: '未读数' },
        has_item: { type: 'TEXT', default: '-', description: '是否有关联商品卡片' },
        updated_at: { type: 'TEXT', notNull: true, description: '更新时间 (ISO)' },
      },
    },

    messages: {
      tableName: 'messages',
      primaryKey: ['id'],
      autoIncrement: true,
      uniqueConstraints: [['contact_name', 'sender', 'content']],
      columns: {
        id: { type: 'INTEGER', notNull: true, description: '自增主键' },
        contact_name: { type: 'TEXT', notNull: true, description: '联系人昵称' },
        sender: { type: 'TEXT', default: '', description: '发送人' },
        is_self: { type: 'TEXT', default: '否', description: '是否当前买家 (是/否)' },
        content: { type: 'TEXT', notNull: true, description: '消息正文' },
        read_status: { type: 'TEXT', default: '-', description: '已读状态' },
        created_at: { type: 'TEXT', notNull: true, description: '消息写入时间 (ISO)' },
      },
    },

    seller_reviews: {
      tableName: 'seller_reviews',
      primaryKey: ['seller'],
      columns: {
        seller: { type: 'TEXT', notNull: true, description: '卖家昵称 (SSOT主键)' },
        status: { 
          type: 'TEXT', 
          notNull: true, 
          enum: ['responsive', 'ghosted', 'unfit', 'unknown'], 
          description: '沟通风控状态: responsive(活跃报价) | ghosted(已读不回) | unfit(无货/关闭) | unknown(未沟通)' 
        },
        reason: { type: 'TEXT', default: '', description: '判定原因与证据消息' },
        last_message: { type: 'TEXT', default: '', description: '最近沟通消息摘录' },
        interaction_count: { type: 'INTEGER', default: 1, description: '累计沟通互动次数' },
        updated_at: { type: 'TEXT', notNull: true, description: '评估时间 (ISO)' },
      },
    },

    candidates: {
      tableName: 'candidates',
      primaryKey: ['item_id'],
      columns: {
        item_id: { type: 'TEXT', notNull: true, description: '商品唯一ID' },
        keyword: { type: 'TEXT', default: '', description: '触发搜索的关键词' },
        category: { type: 'TEXT', default: '', description: '归一化品类 (如 nexg2_nylon / lava_me_air / lava_me_4)' },
        title: { type: 'TEXT', notNull: true, description: '商品标题' },
        price: { type: 'TEXT', notNull: true, description: '商品标价字符串 (如 ¥1650)' },
        price_num: { type: 'REAL', notNull: true, default: 0, description: '数值型价格 (供精准排序与区间筛选)' },
        original_price: { type: 'TEXT', default: '-', description: '划线原价' },
        price_drop: { type: 'TEXT', default: '-', description: '降价幅度' },
        publish_time: { type: 'TEXT', default: '-', description: '发布相对时间' },
        location: { type: 'TEXT', default: '-', description: '商品所在省市' },
        seller: { type: 'TEXT', notNull: true, description: '卖家昵称 (外键指向 seller_reviews)' },
        seller_user_id: { type: 'TEXT', default: '-', description: '卖家用户数字ID' },
        seller_tag: { type: 'TEXT', default: '-', description: '卖家信用/等级标签' },
        condition: { type: 'TEXT', default: '-', description: '商品成色 (如 全新 / 99新)' },
        guarantee: { type: 'TEXT', default: '普通', description: '保障标签 (如 验货宝 / 包邮)' },
        item_url: { type: 'TEXT', notNull: true, description: '商品详情页完整链接' },
        image_url: { type: 'TEXT', default: '', description: '商品主图链接' },
        seller_status: { type: 'TEXT', default: 'unknown', description: '保留兼容字段，真理投影见 candidates_view' },
        seller_note: { type: 'TEXT', default: '', description: '保留兼容字段，真理投影见 candidates_view' },
        status: { type: 'TEXT', default: 'active', description: '候选状态: active | sold | hidden' },
        updated_at: { type: 'TEXT', notNull: true, description: '记录同步时间 (ISO)' },
      },
    },
  },

  views: {
    candidates_view: `
      CREATE VIEW IF NOT EXISTS candidates_view AS
      SELECT 
        c.item_id,
        c.keyword,
        c.category,
        c.title,
        c.price,
        c.price_num,
        c.original_price,
        c.price_drop,
        c.publish_time,
        c.location,
        c.seller,
        c.seller_user_id,
        c.seller_tag,
        c.condition,
        c.guarantee,
        c.item_url,
        c.image_url,
        COALESCE(r.status, c.seller_status, 'unknown') AS seller_status,
        COALESCE(r.reason, c.seller_note, '') AS seller_note,
        c.status,
        c.updated_at
      FROM candidates c
      LEFT JOIN seller_reviews r ON c.seller = r.seller;
    `,
  },

  fts: [
    {
      name: 'orders_fts',
      columns: ['order_id UNINDEXED', 'title', 'seller', 'spec_tag', 'status'],
    },
    {
      name: 'messages_fts',
      columns: ['contact_name', 'sender', 'content'],
    },
    {
      name: 'candidates_fts',
      columns: ['item_id UNINDEXED', 'title', 'seller', 'keyword', 'category'],
    },
  ],
};

/**
 * Generate DDL dynamically from SCHEMA_CONTRACT.
 */
export function generateDdl() {
  const ddlStatements = [];

  for (const [tName, table] of Object.entries(SCHEMA_CONTRACT.tables)) {
    const colDefs = [];
    for (const [cName, col] of Object.entries(table.columns)) {
      let def = `${cName} ${col.type}`;
      if (table.primaryKey?.includes(cName) && table.primaryKey.length === 1) {
        def += ' PRIMARY KEY';
        if (table.autoIncrement) def += ' AUTOINCREMENT';
      }
      if (col.notNull && !(table.primaryKey?.includes(cName) && table.primaryKey.length === 1)) {
        def += ' NOT NULL';
      }
      if (col.default !== undefined) {
        if (typeof col.default === 'string') {
          def += ` DEFAULT '${col.default}'`;
        } else {
          def += ` DEFAULT ${col.default}`;
        }
      }
      colDefs.push(def);
    }

    if (table.primaryKey && table.primaryKey.length > 1) {
      colDefs.push(`PRIMARY KEY (${table.primaryKey.join(', ')})`);
    }

    if (table.uniqueConstraints) {
      for (const u of table.uniqueConstraints) {
        colDefs.push(`UNIQUE(${u.join(', ')})`);
      }
    }

    ddlStatements.push(`CREATE TABLE IF NOT EXISTS ${tName} (\n  ${colDefs.join(',\n  ')}\n);`);
  }

  // FTS virtual tables
  for (const fts of SCHEMA_CONTRACT.fts) {
    ddlStatements.push(`CREATE VIRTUAL TABLE IF NOT EXISTS ${fts.name} USING fts5(\n  ${fts.columns.join(',\n  ')}\n);`);
  }

  // Authoritative SSOT Views
  for (const viewDdl of Object.values(SCHEMA_CONTRACT.views)) {
    ddlStatements.push(viewDdl.trim());
  }

  return ddlStatements;
}

/**
 * Type validation and normalization for Candidates.
 */
export function validateCandidate(data) {
  if (!data || typeof data !== 'object') {
    throw new TypeError('Candidate data must be a valid object');
  }
  const itemId = String(data.item_id || '').trim();
  if (!itemId || itemId === '-') {
    throw new Error('Candidate item_id is required');
  }
  const title = String(data.title || '').trim();
  if (!title) {
    throw new Error('Candidate title is required');
  }

  const rawPrice = String(data.price || '¥0').trim();
  const priceNum = typeof data.price_num === 'number' && !Number.isNaN(data.price_num)
    ? data.price_num
    : parseFloat(rawPrice.replace(/[^\d.]/g, '')) || 0;

  return {
    item_id: itemId,
    keyword: String(data.keyword || '').trim(),
    category: String(data.category || '').trim(),
    title,
    price: rawPrice.startsWith('¥') || rawPrice.startsWith('￥') ? rawPrice : `¥${rawPrice}`,
    price_num: priceNum,
    original_price: String(data.original_price || '-').trim(),
    price_drop: String(data.price_drop || '-').trim(),
    publish_time: String(data.publish_time || '-').trim(),
    location: String(data.location || '-').trim(),
    seller: String(data.seller || '-').trim(),
    seller_user_id: String(data.seller_user_id || '-').trim(),
    seller_tag: String(data.seller_tag || '-').trim(),
    condition: String(data.condition || '-').trim(),
    guarantee: String(data.guarantee || '普通').trim(),
    item_url: String(data.item_url || `https://www.goofish.com/item?id=${itemId}`).trim(),
    image_url: String(data.image_url || '').trim(),
    seller_status: String(data.seller_status || 'unknown').trim(),
    seller_note: String(data.seller_note || '').trim(),
    status: String(data.status || 'active').trim(),
    updated_at: data.updated_at || new Date().toISOString(),
  };
}

/**
 * Type validation for Seller Reviews.
 */
export function validateSellerReview(data) {
  if (!data || typeof data !== 'object') {
    throw new TypeError('Seller review data must be an object');
  }
  const seller = String(data.seller || '').trim();
  if (!seller || seller === '-' || seller === '未知卖家') {
    throw new Error('Valid seller nickname is required for seller review');
  }

  const allowedStatuses = ['responsive', 'ghosted', 'unfit', 'unknown'];
  const status = String(data.status || 'unknown').trim().toLowerCase();
  if (!allowedStatuses.includes(status)) {
    throw new Error(`Invalid seller review status '${status}'. Must be one of: ${allowedStatuses.join(', ')}`);
  }

  return {
    seller,
    status,
    reason: String(data.reason || '').trim(),
    last_message: String(data.last_message || '').trim(),
    interaction_count: Math.max(1, Number(data.interaction_count) || 1),
    updated_at: data.updated_at || new Date().toISOString(),
  };
}

/**
 * Type validation for Orders.
 */
export function validateOrder(data) {
  if (!data || typeof data !== 'object') {
    throw new TypeError('Order data must be an object');
  }
  const orderId = String(data.order_id || '').trim();
  if (!orderId || orderId === '-') {
    throw new Error('Valid order_id is required');
  }

  return {
    order_id: orderId,
    seller: String(data.seller || '').trim(),
    seller_user_id: String(data.seller_user_id || '').trim(),
    status: String(data.status || '').trim(),
    title: String(data.title || '').trim(),
    price: String(data.price || '').trim(),
    spec_tag: String(data.spec_tag || '').trim(),
    item_id: String(data.item_id || '').trim(),
    order_url: String(data.order_url || '').trim(),
    updated_at: data.updated_at || new Date().toISOString(),
  };
}
