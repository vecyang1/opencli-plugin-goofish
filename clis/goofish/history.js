import { cli, Strategy } from '@jackwener/opencli/registry';
import { queryPriceHistory, getPriceHistorySummary } from './_db.js';
import { inferCategory, getProductSpec } from './_contract.js';

export const command = cli({
  site: 'goofish',
  name: 'history',
  access: 'read',
  description: '查询二手历史价格走势、历史最低价、市场中位数与极低价捡漏突刺记录',
  domain: 'www.goofish.com',
  strategy: Strategy.LOCAL,
  browser: false,
  args: [
    { name: 'query', positional: true, required: false, help: '查询关键词或品类 (如 nexg 2n 尼龙 或 绿联 15375)' },
    { name: 'category', type: 'str', help: '归一化品类 (如 nexg2_nylon / ugreen_hub)' },
    { name: 'target-price', type: 'str', help: '目标参考价格 (用于标记低于此价格的捡漏突刺)' },
    { name: 'spikes-only', type: 'bool', default: false, help: '仅展示低于目标价格的捡漏突刺记录' },
    { name: 'limit', type: 'int', default: 30, help: '返回历史记录条数 (默认 30)' },
  ],
  columns: [
    'spotted_at',
    'price',
    'tag',
    'condition',
    'defect_notes',
    'seller',
    'title',
    'item_url',
  ],
  func: async (first, second) => {
    const kwargs = (second && typeof second === 'object' && !second.isContext) ? second : (first || {});
    const rawPos = kwargs.query || kwargs._?.[0] || '';
    const spec = getProductSpec(kwargs.category || rawPos);
    const category = kwargs.category ? String(kwargs.category).trim() : (spec ? spec.category : inferCategory({ keyword: rawPos }));
    const keyword = String(rawPos || (spec ? spec.defaultQuery : '') || '').trim();
    const targetPrice = kwargs['target-price'] ? parseFloat(String(kwargs['target-price']).replace(/[^\d.]/g, '')) : 0;
    const spikesOnly = Boolean(kwargs['spikes-only']);
    const limit = Math.max(1, Math.min(Number(kwargs.limit) || 30, 200));

    const records = queryPriceHistory({
      keyword: keyword || null,
      category: category && category !== 'other' ? category : null,
      is_below_target: spikesOnly ? true : null,
      limit,
    });

    if (records.length === 0) {
      return [{
        spotted_at: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
        price: '-',
        tag: 'ℹ️ 暂无历史记录',
        condition: '-',
        defect_notes: '未扫描到该关键词的历史价格数据，请先执行 xy-chat watch 或由后台监控任务抓取',
        seller: '-',
        title: keyword || category || '未指定关键词',
        item_url: '-',
      }];
    }

    const summary = getPriceHistorySummary({ keyword, category, target_price: targetPrice });

    return records.map(r => {
      let tag = '📊 常规在售';
      if (r.price_num === summary.lowestPrice) {
        tag = '🏆 历史最低价';
      } else if (r.is_below_target || (targetPrice > 0 && r.price_num <= targetPrice)) {
        tag = '🔥 捡漏低价突刺';
      } else if (r.price_num <= summary.averagePrice * 0.85) {
        tag = '📉 显著偏低';
      }

      return {
        spotted_at: r.spotted_at ? new Date(r.spotted_at).toLocaleTimeString('zh-CN', { hour12: false }) : '-',
        price: r.price,
        tag,
        condition: r.condition || '95新',
        defect_notes: r.defect_notes || '-',
        seller: r.seller || '-',
        title: r.title,
        item_url: r.item_url,
      };
    });
  },
});
