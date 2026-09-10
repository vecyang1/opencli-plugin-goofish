import { cli, Strategy } from '@jackwener/opencli/registry';
import { queryCandidates } from './_db.js';

export const command = cli({
  site: 'goofish',
  name: 'candidates',
  access: 'read',
  description: '查询本地 SQLite SSOT 沉淀的二手候选商品库 (支持品类别名映射、价格区间、关键词及卖家风控过滤)',
  domain: 'www.goofish.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'query', positional: true, required: false, help: '品类或关键词 (如 nexg2_nylon / lava_me_air / lava_me_4 / me4 / air / 2n)' },
    { name: 'category', type: 'str', required: false, help: '指定品类过滤 (如 nexg2_nylon / lava_me_air / lava_me_4)' },
    { name: 'keyword', type: 'str', required: false, help: '商品标题或卖家关键词过滤' },
    { name: 'min-price', type: 'str', required: false, help: '最低价格过滤' },
    { name: 'max-price', type: 'str', required: false, help: '最高价格过滤' },
    { name: 'exclude-ghosted', type: 'bool', default: false, help: '是否过滤曾已读不回或明确无货卖家' },
    { name: 'sort', type: 'str', default: 'price_asc', help: '排序方式: price_asc | price_desc | updated' },
    { name: 'limit', type: 'int', default: 50, help: '返回候选数量上限 (默认 50)' },
  ],
  columns: [
    'item_id',
    'category',
    'price',
    'seller',
    'seller_status',
    'title',
    'condition',
    'location',
    'item_url',
  ],
  func: async (_page, kwargs) => {
    const rawPos = String(kwargs.query || kwargs._?.[0] || '').trim();
    const category = String(kwargs.category || rawPos).trim();
    const keyword = String(kwargs.keyword || kwargs.q || '').trim();
    const minPrice = kwargs['min-price'] || null;
    const maxPrice = kwargs['max-price'] || null;
    const excludeGhosted = Boolean(kwargs['exclude-ghosted']);
    const sort = String(kwargs.sort || 'price_asc').trim();
    const limit = Math.max(1, Math.min(Number(kwargs.limit) || 50, 500));

    const rows = queryCandidates({
      category,
      keyword,
      minPrice,
      maxPrice,
      excludeGhosted,
      sort,
      limit,
    });

    return rows.map((r) => ({
      item_id: r.item_id,
      category: r.category || '-',
      price: r.price,
      seller: r.seller,
      seller_status: r.seller_status === 'responsive' 
        ? '✅ 活跃报价' 
        : (r.seller_status === 'ghosted' 
            ? '⚠️ 曾已读不回' 
            : (r.seller_status === 'unfit' ? '❌ 明确无货' : '❓ 待沟通')),
      title: r.title,
      condition: r.condition || '-',
      location: r.location || '-',
      item_url: r.item_url || `https://www.goofish.com/item?id=${r.item_id}`,
    }));
  },
});
