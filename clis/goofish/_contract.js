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
        seller_user_id: { type: 'TEXT', default: '', description: '卖家用户数字ID' },
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
      LEFT JOIN seller_reviews r ON (
        c.seller = r.seller OR 
        (c.seller_user_id != '' AND c.seller_user_id != '-' AND r.seller_user_id != '' AND c.seller_user_id = r.seller_user_id)
      );
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
 * Universal junk/noise regex pattern across all product categories.
 * Excludes packaging boxes, manual fees, repair services, blueprints, deposit/postage adjustments, model dummies.
 */
export const UNIVERSAL_JUNK_REGEX = /(?:图纸|维修费|手工费|专拍链接|邮费补差|补差价|补运费|定金|包装盒|空盒子|空盒|包装箱|说明书|模型机|展示机壳|保护膜|贴膜|自提专拍)/i;

/**
 * Standard guitar accessory regex pattern.
 * Excludes pedals, foot-switches, microphones, cables, earphones, brackets, parts, gig bags, pickups, strings, etc.
 */
export const GUITAR_ACCESSORY_REGEX = /(?:踏板|踩钉|麦克风|话筒|耳麦|耳机|支架|主板|琴包|背带|网线|插头|零配件|贴纸|图传|接头|书籍|音箱线|连接线|电源适配器|充电线|拾音器|琴弦|指套|换弦器|防尘罩|变调夹|拨片)/i;

/**
 * Standard digital 3C noise regex pattern.
 * Excludes phone cases, silicone sleeves, lanyards, dummy shells.
 */
export const DIGITAL_NOISE_REGEX = /(?:手机壳|保护套|挂绳|收纳包|纯包装|展示壳)/i;

// Backward-compatible alias for existing imports
export const ACCESSORY_REGEX = GUITAR_ACCESSORY_REGEX;

/**
 * Check if a title indicates an accessory or non-target product.
 * Supports category-aware filtering and user-supplied custom exclusions.
 */
export function isAccessoryTitle(title, category = '', customExclude = []) {
  if (!title || typeof title !== 'string') return false;

  // 1. Universal junk across all categories
  if (UNIVERSAL_JUNK_REGEX.test(title)) return true;

  // 2. User-specified custom exclusions
  if (Array.isArray(customExclude) && customExclude.length > 0) {
    const lower = title.toLowerCase();
    for (const kw of customExclude) {
      if (kw && lower.includes(String(kw).toLowerCase().trim())) {
        return true;
      }
    }
  }

  // 3. Category-specific noise filtering
  const cat = String(category || '').toLowerCase();
  const isGuitarCategory = !cat || 
                           cat.includes('guitar') || 
                           cat.includes('nexg') || 
                           cat.includes('lava') || 
                           cat === 'other';

  if (isGuitarCategory) {
    if (GUITAR_ACCESSORY_REGEX.test(title)) return true;
    if (cat === 'lava_me_air' && /play/i.test(title) && !/air/i.test(title)) return true;
  } else if (cat.includes('hub') || cat.includes('dock') || cat.includes('digital') || cat.includes('15375') || cat.includes('electronic')) {
    if (DIGITAL_NOISE_REGEX.test(title)) return true;
  }

  return false;
}

/**
 * Infer or normalize canonical category slug from keyword, title, or raw category string.
 */
export function inferCategory({ category = '', keyword = '', title = '' } = {}) {
  const text = `${category} ${keyword} ${title}`.toLowerCase().trim();
  if (text.includes('me4') || text.includes('me 4') || text.includes('lava4') || text.includes('lava 4') || text.includes('拿火4') || text.includes('拿火 4')) {
    return 'lava_me_4';
  }
  if (text.includes('air') || text.includes('拿火air') || text.includes('拿火 air')) {
    return 'lava_me_air';
  }
  if (text.includes('nexg') || text.includes('2n') || text.includes('nylon') || text.includes('尼龙')) {
    return 'nexg2_nylon';
  }
  if (text.includes('扩展坞') || text.includes('拓展坞') || text.includes('hub') || text.includes('15375')) {
    return 'ugreen_hub';
  }
  const cleanCat = String(category || '').trim().toLowerCase();
  if (cleanCat && cleanCat !== 'all' && cleanCat !== '全部') {
    return category;
  }
  const kw = String(keyword || '').trim().toLowerCase();
  if (kw) {
    return kw.replace(/\s+/g, '_');
  }
  return 'other';
}

/**
 * Regex patterns for seller communication analysis.
 * Uses negative lookbehinds/lookaheads to prevent matching questions like '有没有' or '没有问题'.
 */
export const UNFIT_SELLER_REGEX = /(?:(?<!有)没有(?!问题|毛病|瑕疵|损坏)|没有咯|已出|卖了|不在了|下架|缺货|只有se|仅se|卖家关闭了订单|不单出|已坏|故障)/i;
export const GHOST_SELLER_REGEX = /(?:没回复说明客服可能在忙|自动回复|智能客服)/;
export const RESPONSIVE_SELLER_REGEX = /(?:全新正品|包邮|专拍价|可以发|明天发|当天发|有货|现货|在的|还在|有奶白|加振款|拿火源|标价.*拿火|\b(?:1\d{3}|2\d{3})\b)/;

/**
 * Classifies a seller's communication status based on session metadata and messages.
 * Evaluates seller messages (is_self = '否') strictly separate from buyer messages (is_self = '是'),
 * ensuring buyer questions like '请问有没有现货' never misclassify a seller as unfit.
 */
export function classifySellerCommunication({ session = {}, messages = [] }) {
  const seller = session.contact_name || '';
  const sellerMsgs = messages.filter(m => m.is_self === '否').map(m => m.content);
  const lastSellerMsg = sellerMsgs[sellerMsgs.length - 1] || '';
  const lastMsg = session.last_message || (messages[messages.length - 1]?.content || '-');

  // Trade closed is an unambiguous unfit signal
  if (
    session.trade_status === '交易关闭' || 
    /卖家关闭了订单/i.test(lastMsg) || 
    /卖家关闭了订单/i.test(session.last_message || '')
  ) {
    return {
      seller,
      status: 'unfit',
      reason: '交易已关闭或卖家取消订单',
      last_message: lastMsg,
    };
  }

  // Build seller text pool from explicit seller messages plus session last_message
  // when last message was not sent by the buyer
  const pool = [...sellerMsgs];
  if (
    (messages.length === 0 || messages[messages.length - 1]?.is_self !== '是') &&
    session.last_message &&
    session.last_message !== '-' &&
    !pool.includes(session.last_message)
  ) {
    pool.push(session.last_message);
  }
  const sellerText = pool.join(' | ');

  // Check seller's actual messages for explicit lack of stock
  if (sellerText && UNFIT_SELLER_REGEX.test(sellerText)) {
    const m = sellerText.match(UNFIT_SELLER_REGEX);
    return {
      seller,
      status: 'unfit',
      reason: `卖家明确无货或已出: ${m ? m[0] : lastSellerMsg || session.last_message}`,
      last_message: lastSellerMsg || lastMsg,
    };
  }

  // Check for ghosted: automated reply only, or buyer asked and seller never replied
  if (
    (sellerText && GHOST_SELLER_REGEX.test(sellerText) && (sellerMsgs.length <= 2 || messages.length === 0)) ||
    (messages.length >= 1 && sellerMsgs.length === 0) ||
    (sellerMsgs.length >= 1 && sellerMsgs.every(m => m.trim() === '[微笑]' || m.trim() === '对方撤回了一条信息'))
  ) {
    return {
      seller,
      status: 'ghosted',
      reason: `已读不回或仅自动回复/表情: ${lastSellerMsg || lastMsg}`,
      last_message: lastSellerMsg || lastMsg,
    };
  }

  // Check for responsive: active quotes, stock confirmations
  if (sellerText && RESPONSIVE_SELLER_REGEX.test(sellerText)) {
    const quote = sellerText.match(RESPONSIVE_SELLER_REGEX)?.[0] || lastSellerMsg || session.last_message;
    return {
      seller,
      status: 'responsive',
      reason: `活跃报价与现货确认: ${quote}`,
      last_message: lastSellerMsg || lastMsg,
    };
  }

  return {
    seller,
    status: 'unknown',
    reason: '待进一步沟通或未获取完整消息',
    last_message: lastMsg,
  };
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

  const keyword = String(data.keyword || '').trim();
  let category = String(data.category || '').trim();
  if (!category || category === 'all' || category === '全部') {
    category = inferCategory({ category, keyword, title });
  }

  return {
    item_id: itemId,
    keyword,
    category,
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
    seller_user_id: String(data.seller_user_id || '').trim(),
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
