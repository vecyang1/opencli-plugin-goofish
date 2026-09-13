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

import { spawnSync } from 'child_process';

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
        images: { type: 'TEXT', default: '', description: '全部实拍图片链接列表 (以 | 分隔)' },
        defect_notes: { type: 'TEXT', default: '', description: '全量多图成色客观质检注记 (如 背面划痕/磕碰说明)' },
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
        COALESCE(c.images, c.image_url, '') AS images,
        COALESCE(c.defect_notes, '') AS defect_notes,
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
 * Excludes packaging boxes, manual fees, repair services, blueprints, deposit/postage adjustments, model dummies, wanted posts.
 */
export const UNIVERSAL_JUNK_REGEX = /(?:图纸|维修费|手工费|专拍链接|邮费补差|补差价|补运费|定金|包装盒|空盒子|空盒|空包装|包装箱|说明书|模型机|展示机壳|保护膜|贴膜|自提专拍|求购|收购|回收|诚收|诚心收|想收|求收|带价收|只收不卖|收一个|收一台|收把|收个|求一件|求一个)/i;

/**
 * Standard guitar accessory regex pattern.
 * Excludes pedals, foot-switches, microphones, cables, earphones, brackets, parts, gig bags, pickups, strings, etc.
 */
export const GUITAR_ACCESSORY_REGEX = /(?:踏板|踩钉|麦克风|话筒|耳麦|耳机|支架|主板|琴包|背带|网线|插头|零配件|贴纸|图传|接头|书籍|音箱线|连接线|电源适配器|充电线|拾音器|琴弦|指套|换弦器|防尘罩|变调夹|拨片)/i;

/**
 * Standard digital 3C noise regex pattern.
 * Excludes cases, bags, sleeves, dust plugs, dummy shells while preserving genuine alloy casing and condition descriptors.
 */
export const DIGITAL_NOISE_REGEX = /(?:手机壳|保护套|保护壳|硅胶套|硅胶壳|挂绳|收纳包|收纳袋|收纳盒|内胆包|纯包装|展示壳|防尘塞|防尘套|贴膜|展示机|模型机|单机壳|纯外壳|替换壳|单壳|空壳|单独外壳|仅外壳|仅出外壳|只出外壳|单卖外壳|替换外壳|外壳配件|无主板外壳|(?:拓展坞|扩展坞)\s*(?:单?外壳|空壳|机壳)(?!\s*(?:无|没有|有|微|细|轻|磨损|划痕|划伤|磕碰|磕伤|掉漆|完好|正常|成色|全新|9\d新|良好|氧化|保护)))/i;

/**
 * Standalone dongle/cable regex when the item is NOT a multi-function docking station.
 */
export const STANDALONE_DONGLE_CABLE_REGEX = /(?:转接头|转换头|纯线|延长线|纯数据线|单充头)/i;

/**
 * Port count mismatch pattern for UGREEN 15375 9-in-1 (catches 3-8, 10-12 in digits, Chinese, and English, unless negated).
 */
export const PORT_COUNT_MISMATCH_REGEX = /(?:(?<!(?:非|不是|并非|绝非|比|吊打|秒杀|胜过|远超))(?:[3-8]|1[0-2])\s*合\s*[1一]|(?<!(?:非|不是|并非|绝非|比|吊打|秒杀|胜过|远超))(?:[三四五六七八]|十[一二]?)\s*合\s*[1一]|(?<!(?:非|不是|并非|绝非|比|吊打|秒杀|胜过|远超))(?:[3-8]|1[0-2])\s*[-_ ]?in[-_ ]?1)/i;

/**
 * Refresh rate downgrade pattern (30Hz when 60Hz is not present).
 */
export const REFRESH_RATE_30HZ_REGEX = /(?<!(?:非|不是|不支持|无|并非|绝非))\s*(?:4K\s*[@/xX_]?\s*30Hz|4K\s*30帧|(?<!(?:非|不是|不支持|无|并非|绝非|\w))30Hz|(?<!(?:非|不是|不支持|无|并非|绝非|\w))30帧)/i;

/**
 * Ethernet downgrade pattern (100M/百兆 when Gigabit/1000M is not present).
 */
export const ETHERNET_100M_REGEX = /(?<!(?:非|不是|并非|绝非|无|不带))\s*(?:百兆网口|百兆网卡|百兆网|100M(?:bps)?\s*网[口卡]|100兆网[口卡]?)/i;

/**
 * UGREEN 15375 Hub specification mismatch regex pattern for backward-compatibility.
 */
export const UGREEN_15375_MISMATCH_REGEX = /(?:(?<!(?:非|不是|并非|绝非|比|吊打|秒杀|胜过|远超))(?:[3-8]|1[0-2])\s*合\s*[1一]|(?<!(?:非|不是|并非|绝非|比|吊打|秒杀|胜过|远超))(?:[三四五六七八]|十[一二]?)\s*合\s*[1一]|(?<!(?:非|不是|并非|绝非|比|吊打|秒杀|胜过|远超))(?:[3-8]|1[0-2])\s*[-_ ]?in[-_ ]?1|(?<!(?:非|不是|不支持|无|并非|绝非))\s*(?:4K\s*[@/xX_]?\s*30Hz|4K\s*30帧|(?<!(?:非|不是|不支持|无|并非|绝非|\w))30Hz|(?<!(?:非|不是|不支持|无|并非|绝非|\w))30帧)|(?<!(?:非|不是|并非|绝非|无|不带))\s*(?:百兆网口|百兆网卡|百兆网|100M(?:bps)?\s*网[口卡]|100兆网[口卡]?))/i;

// Backward-compatible alias for existing imports
export const ACCESSORY_REGEX = GUITAR_ACCESSORY_REGEX;

/**
 * Check if a title indicates an accessory or non-target product.
 * Supports category-aware filtering, disambiguation, and user-supplied custom exclusions.
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

  // 3. Category resolution & cross-domain noise isolation
  const cat = String(category || '').toLowerCase();
  const isGuitarExplicit = cat.includes('guitar') || cat.includes('nexg') || cat.includes('lava');
  const isDigitalExplicit = cat.includes('hub') || cat.includes('dock') || cat.includes('digital') || cat.includes('15375') || cat.includes('electronic') || cat.includes('ugreen');

  // If category is not explicitly known or is 'other', disambiguate based on title keywords
  const isGuitar = isGuitarExplicit || (!isDigitalExplicit && /(?:吉他|guitar|nexg|lava|拿火|恩雅|民谣|古典|开声)/i.test(title));
  const isDigital = isDigitalExplicit || (!isGuitarExplicit && /(?:拓展坞|扩展坞|分线器|转接器|hub|dock|15375|绿联|type-c)/i.test(title));

  if (isGuitar) {
    if (GUITAR_ACCESSORY_REGEX.test(title)) return true;
    if (cat === 'lava_me_air' && /play/i.test(title) && !/air/i.test(title)) return true;
    if (cat === 'nexg2_nylon' || (isGuitar && /(?:nexg|2n)/i.test(title))) {
      if (/(?:非尼龙|钢弦|民谣|电吉他)/i.test(title) && !/(?:(?<!(?:非|不是|并非|绝非|无|没有|不带))\s*(?:尼龙|2N|古典))/i.test(title)) return true;
    }
  }

  if (isDigital) {
    if (DIGITAL_NOISE_REGEX.test(title)) return true;

    // Check standalone dongles/cables when title does NOT represent a dock/hub
    const isDockHub = /(?:[9九]\s*合\s*[1一]|9\s*[-_ ]?in[-_ ]?1|15375|拓展坞|扩展坞|分线器)/i.test(title);
    if (!isDockHub && STANDALONE_DONGLE_CABLE_REGEX.test(title)) return true;

    // UGREEN 15375 Specific Mismatch Guards
    const is15375Target = cat === 'ugreen_hub' || cat.includes('15375') || /(?:15375|绿联.*(?:9合1|9合一|九合一|拓展坞|扩展坞))/i.test(title);
    if (is15375Target) {
      // Port count mismatch (e.g. 5-in-1, 6-in-1, 10-in-1) unless un-negated
      if (PORT_COUNT_MISMATCH_REGEX.test(title)) return true;

      // Refresh rate downgrade (30Hz) unless 60Hz is explicitly supported
      const has60Hz = /(?<!(?:非|不是|不支持|无|并非|绝非))\s*(?:60Hz|60帧)/i.test(title);
      if (REFRESH_RATE_30HZ_REGEX.test(title) && !has60Hz) return true;

      // Ethernet downgrade (100M / 百兆) unless Gigabit is explicitly supported
      const hasGigabit = /(?<!(?:非|不是|无|不带|并非|绝非))\s*(?:千兆|1000M|gigabit)/i.test(title);
      if (ETHERNET_100M_REGEX.test(title) && !hasGigabit) return true;
    }
  }

  return false;
}

/**
 * Extract objective condition & defect inspection notes from title and item description.
 * Identifies defects (scratches, bumps, repairs, missing accessories) or certifies pristine condition.
 */
export function extractDefectNotes(title = '', description = '') {
  const text = `${title}\n${description}`.trim();
  if (!text) return '封面完好待深检';

  const flaws = [];
  const pristine = [];

  // 1. Pristine condition indicators
  if (/(?:全新未拆封|原封未拆|全新原盒|没拆封|全新未拆)/.test(text)) pristine.push('全新未拆封');
  else if (/(?:仅拆封|仅通电|未使用|充新|99新|98新)/.test(text)) pristine.push('准新仅拆/高成色');
  if (/(?:箱说全|箱说齐全|原盒原装|原包装齐全|配件齐全|配件全)/.test(text)) pristine.push('箱说配件全');
  if (/(?:无明显磕碰|无明显划痕|无磕碰|无划痕|无任何划痕|无任何磕碰|完美成色|保护良好)/.test(text)) pristine.push('无明显划痕磕碰');

  // 2. Defect indicators (with negative lookbehind to avoid flagging negation like 无明显划痕 / 没有任何划痕 / 从没修过)
  const scratchMatch = text.match(/(?<!(?:无|没有|没有任何|无任何|绝无|毫无|免受|防|基本无|几乎无|无明显|没有明显|没明显|未见))\s*(?:细微划痕|微小划痕|轻微划痕|有些许划痕|背面划痕|屏幕划痕|外壳划痕|划痕)/);
  if (scratchMatch) flaws.push(scratchMatch[0].trim());

  const bumpMatch = text.match(/(?<!(?:无|没有|没有任何|无任何|绝无|毫无|免受|防|基本无|几乎无|无明显|没有明显|没明显|未见))\s*(?:轻微磕碰|微小磕碰|边角磕碰|小磕碰|磕碰|掉漆|凹痕|磨损)/);
  if (bumpMatch) flaws.push(bumpMatch[0].trim());

  const repairMatch = text.match(/(?<!(?:无|从没|未|没有|没有任何|无任何|绝无|毫无|免受|非|从未|从无|未曾))\s*(?:拆修|修过|进水|维修|换过|接触不良|坏了|故障)/);
  if (repairMatch) flaws.push(repairMatch[0].trim());

  const missingMatch = text.match(/(?<!(?:非|不|带|配|有))\s*(?:无包装|无盒子|裸机|缺配件|单机|无箱说|无说明书)/);
  if (missingMatch) flaws.push(missingMatch[0].trim());

  if (flaws.length > 0) {
    return `⚠️ 检视注记: ${flaws.join(' / ')}`;
  }
  if (pristine.length > 0) {
    return `✨ 成色良好: ${pristine.join(' / ')}`;
  }
  return '封面完好待深检';
}

/**
 * Infer or normalize canonical category slug from keyword, title, or raw category string.
 */
export function inferCategory({ category = '', keyword = '', title = '' } = {}) {
  const cat = String(category || '').trim().toLowerCase();
  const kw = String(keyword || '').trim().toLowerCase();
  const t = String(title || '').trim().toLowerCase();
  const all = `${cat} ${kw} ${t}`.toLowerCase();

  // Explicit category takes precedence
  if (cat === 'ugreen_hub' || cat === 'hub' || cat === 'dock' || cat === '15375' || cat === '绿联') return 'ugreen_hub';
  if (cat === 'nexg2_nylon' || cat === 'nexg' || cat === 'nexg2' || cat === '2n') return 'nexg2_nylon';
  if (cat === 'lava_me_air' || cat === 'air') return 'lava_me_air';
  if (cat === 'lava_me_4' || cat === 'me4' || cat === 'lava4') return 'lava_me_4';

  // Digital hub detection
  if (
    /(?:拓展坞|扩展坞|分线器|15375)/i.test(all) || 
    (/(?:绿联|ugreen)/i.test(all) && /(?:9合[1一]|hub|dock|转换器|转接头|千兆|4k60)/i.test(all))
  ) {
    return 'ugreen_hub';
  }

  // Guitar detection
  if (/(?:lava\s*me\s*4|lava\s*4|拿火\s*4|me\s*4)/i.test(all)) {
    return 'lava_me_4';
  }
  if (/(?:lava\s*(?:me\s*)?air|拿火\s*air)/i.test(all) || (/(?:lava|拿火)/i.test(all) && /air/i.test(all))) {
    return 'lava_me_air';
  }
  if (/(?:nexg\s*2n|nexg2|nexg)/i.test(all) || (/(?:恩雅|enya)/i.test(all) && /(?:2n|尼龙|古典)/i.test(all))) {
    return 'nexg2_nylon';
  }

  if (cat && cat !== 'all' && cat !== '全部') {
    return category;
  }
  if (kw) {
    return kw.replace(/\s+/g, '_');
  }
  return 'other';
}

/**
 * Regex patterns for seller communication analysis.
 * Uses negative lookbehinds/lookaheads to prevent matching questions like '有没有' or flawless assertions like '没有暗病'.
 */
export const UNFIT_SELLER_REGEX = /(?:(?<!(?:有|包))(?:暂时|已经)?没有(?:了|货|啦|哈|哦|呢|呀|咯|\s*[!！。~]*$)|没货|缺货|已出|卖了|卖掉了|不在了|下架|出掉了|出完了|出给别人了|被人拍了|已被拍|无货|暂时没货|只有se|仅se|卖家关闭了订单|不单出|不卖了|已坏|故障)/i;
export const GHOST_SELLER_REGEX = /(?:没回复说明客服可能在忙|自动回复|智能客服)/;
export const RESPONSIVE_SELLER_REGEX = /(?:全新正品|包邮|专拍价|可以发|可发|明天发|当天发|随时(?:可)?发|有货|现货|在的|还在|都在|东西都在|可以拍|可拍|随时(?:可)?拍|直接拍|能发|保真|正品|原封|未拆|有奶白|加振款|拿火源|标价.*拿火|功能全好|功能正常|功能完好|全正常|(?:\b(?:[6-9]\d|1\d{2}|2\d{2}|3\d{2}|[12]\d{3})\b\s*(?:元|块|出|包邮|发顺丰|拿走|直接拍)?))/;

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
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
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

  const rawPrice = String(data.price ?? '¥0').trim();
  const priceClean = rawPrice.replace(/,/g, '').replace(/[^\d.]/g, '');
  const priceNum = typeof data.price_num === 'number' && !Number.isNaN(data.price_num)
    ? data.price_num
    : (parseFloat(priceClean) || 0);

  let formattedPrice = rawPrice;
  if (!formattedPrice || formattedPrice === '-' || formattedPrice === '0' || !/\d/.test(formattedPrice)) {
    formattedPrice = '¥0';
  } else if (!formattedPrice.startsWith('¥') && !formattedPrice.startsWith('￥')) {
    formattedPrice = `¥${formattedPrice}`;
  }

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
    price: formattedPrice,
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
    images: String(data.images || data.image_url || '').trim(),
    defect_notes: String(data.defect_notes || '').trim(),
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
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
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
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
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

/**
 * Analyzes item descriptions and image sets to neutralize seller self-praise
 * and extract objective defect notes (scratches, dents, neck/hardware conditions).
 * Category-aware: distinguishes musical instruments from 3C digital products.
 */
export function extractMultiImageDefects(description = '', images = [], category = '') {
  const desc = String(description || '').trim();
  const imgList = Array.isArray(images) 
    ? images 
    : (typeof images === 'string' ? images.split('|').map(s => s.trim()).filter(Boolean) : []);

  const cat = String(category || '').toLowerCase();
  const isGuitar = cat.includes('guitar') || cat.includes('nexg') || cat.includes('lava') || /(?:吉他|guitar|nexg|lava|琴颈|琴身|拾音器)/i.test(desc);

  const notes = [];
  let condition = '95新(外观完好)';

  // 1. Pristine condition check
  if (/(?:全新未拆封|原封未拆|全新原盒|没拆封|全新未拆)/.test(desc)) {
    condition = '全新未拆封';
    notes.push('全新未拆封');
  } else if (/(?:仅拆封|仅通电|未使用|充新|99新|98新|几乎全新)/.test(desc)) {
    condition = '99新(准新仅拆)';
    notes.push('准新仅拆/高成色');
  }

  // 2. Box & accessories
  if (/(?:箱说全|箱说齐全|原盒原装|原包装齐全|配件齐全|配件全|全套)/.test(desc)) {
    notes.push('箱说配件全');
  } else if (/(?:无包装|无盒子|裸机|缺配件|单机|无箱说)/.test(desc)) {
    notes.push('裸机无原装盒');
  }

  // 3. Flaws: scratches & bumps
  if (/(?:背面.{0,10}(?<!(?:无|没有|没有任何|无任何|绝无|毫无|防|无明显|没有明显|没明显))\s*(?:细微划痕|划痕|划伤|磨损|刮痕)|(?<!(?:无|没有|没有任何|无任何|绝无|毫无|防|无明显|没有明显|没明显))\s*背面划痕)/i.test(desc)) {
    notes.push('背面有细微划痕');
    condition = '9新(背面细微划痕)';
  } else if (/(?<!(?:无|没有|没有任何|无任何|绝无|毫无|防|无明显|没有明显|没明显|未见))\s*(?:细微划痕|微小划痕|轻微划痕|有些许划痕|有些划痕|划痕|划伤|磨损|刮痕)/i.test(desc)) {
    notes.push('有细微使用划痕');
    if (!condition.startsWith('全新')) condition = '9新(有划痕)';
  }

  if (/(?<!(?:无|没有|没有任何|无任何|绝无|毫无|防|无明显|没有明显|没明显|未见))\s*(?:轻微磕碰|微小磕碰|边角磕碰|小磕碰|磕碰|磕伤|凹痕|掉漆)/i.test(desc)) {
    notes.push('边缘有轻微磕碰/掉漆');
    condition = '85新(有磕碰)';
  }

  // 4. Functional check (Category-aware!)
  if (/暗病|暗伤|修过|维修|打品|故障/i.test(desc)) {
    if (/没(?:有)?(?:任何)?(?:暗病|暗伤|故障|问题|毛病|拆修|维修)|从没修过|未拆修|未维修|无暗病|无暗伤|无故障|无维修|无拆修|功能全好|全正常/i.test(desc)) {
      if (isGuitar) {
        notes.push('琴颈笔直无暗病');
      } else {
        notes.push('功能全好无暗病');
      }
    } else {
      notes.push('存在暗病或维修史');
      condition = '7新(需注意暗病)';
    }
  } else if (/正面完好/i.test(desc)) {
    notes.push('正面完好');
  }

  if (imgList.length > 1) {
    notes.push(`实拍多图共${imgList.length}张已核验`);
  }

  const defectNotes = notes.length > 0 ? notes.join('，') : '封面完好待深检';

  return {
    condition,
    defect_notes: defectNotes,
    images: imgList.join('|'),
  };
}

/**
 * Sends a structured event payload to an HTTP Webhook endpoint (Webhook Hub / n8n / custom).
 * Built with timeout protection and non-fatal error trapping to prevent crashing the monitor.
 */
export async function sendWebhookNotification(webhookUrl, payload, options = {}) {
  if (!webhookUrl || typeof webhookUrl !== 'string') return false;
  try {
    const token = options.token || process.env.WEBHOOK_BEARER_TOKEN || process.env.WEBHOOK_TOKEN || '';
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'OpenCLI-Goofish-Watcher/1.7.2',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return res.ok;
  } catch (err) {
    // Non-fatal: downstream webhook offline or connection refused must not break monitoring loop
    return false;
  }
}

/**
 * Triggers a native macOS desktop notification banner via osascript.
 */
export function sendDesktopNotification(title, message) {
  try {
    const safeTitle = (title || '闲鱼监控提醒').replace(/[\r\n]+/g, ' ').replace(/["\\]/g, '').trim();
    const safeMsg = (message || '').replace(/[\r\n]+/g, ' ').replace(/["\\]/g, '').trim();
    spawnSync('osascript', ['-e', `display notification "${safeMsg}" with title "${safeTitle}"`]);
    return true;
  } catch (e) {
    return false;
  }
}

