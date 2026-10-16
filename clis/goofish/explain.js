import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError } from '@jackwener/opencli/errors';
import { explainCandidateEvaluation } from './_contract.js';
import { queryCandidates } from './_db.js';

export const command = cli({
  site: 'goofish',
  name: 'explain',
  access: 'read',
  description: '对闲鱼商品样本、标题或已有候选进行契约对账与规则审计 (可解释性推演、底价对账、配件杂音及低价陷阱诊断)',
  domain: 'www.goofish.com',
  strategy: Strategy.LOCAL,
  browser: false,
  args: [
    { name: 'target', positional: true, required: true, help: '待诊断的商品标题、关键词或已有商品 ID (如: "AEROBAND PocketDrum2 Ultra" 或 1074341458523)' },
    { name: 'price', type: 'str', required: false, help: '商品标价 (如 88, 790)' },
    { name: 'category', type: 'str', required: false, help: '显式指定品类 (可选，默认自动推断)' },
    { name: 'description', type: 'str', required: false, help: '商品长文本描述 (用于深度缺陷与成色复核)' },
    { name: 'target-price', type: 'str', required: false, help: '设定捡漏目标价 (用于测试突刺告警)' },
    { name: 'price-floor', type: 'str', required: false, help: '覆盖测试底价 (可选)' },
    { name: 'exclude', type: 'str', required: false, help: '自定义排除词，逗号分隔' },
    { name: 'require', type: 'str', required: false, help: '自定义必须词，逗号分隔' },
  ],
  columns: [
    'title',
    'price',
    'archetype',
    'category',
    'floor_price',
    'is_accessory',
    'low_price_risk',
    'tier',
    'action',
    'explanation',
  ],
  func: async (first, second) => {
    const kwargs = (second && typeof second === 'object' && !second.isContext) ? second : (first || {});
    const rawPos = (Array.isArray(kwargs._) && kwargs._.length > 0)
      ? kwargs._.join(' ')
      : String(kwargs.target || kwargs.query || '').trim();

    if (!rawPos) {
      throw new ArgumentError('请指定要诊断对账的商品标题、关键词或商品 ID');
    }

    let title = rawPos;
    let price = kwargs.price || 0;
    let description = kwargs.description || '';
    let category = kwargs.category || '';
    let images = [];

    // Check if target matches an existing candidate item_id in SQLite SSOT
    if (/^\d{10,16}$/.test(rawPos.trim())) {
      const existing = queryCandidates({ keyword: rawPos.trim(), limit: 1 });
      if (existing && existing.length > 0) {
        const item = existing[0];
        title = item.title || rawPos;
        if (!price && item.price) {
          price = item.price;
        }
        if (!category && item.category) {
          category = item.category;
        }
        if (!description && item.defect_notes) {
          description = item.defect_notes;
        }
        if (item.images) {
          images = item.images.split('|').map(s => s.trim()).filter(Boolean);
        }
      }
    }

    const customExclude = kwargs.exclude 
      ? String(kwargs.exclude).split(/[,，]/).map(s => s.trim()).filter(Boolean) 
      : [];
    const customRequire = kwargs.require 
      ? String(kwargs.require).split(/[,，]/).map(s => s.trim()).filter(Boolean) 
      : [];
    const targetPrice = kwargs['target-price'] ? parseFloat(kwargs['target-price']) : 0;
    const priceFloor = kwargs['price-floor'] ? parseFloat(kwargs['price-floor']) : null;

    const evalResult = explainCandidateEvaluation({
      title,
      price,
      description,
      images,
      category,
      customExclude,
      customRequire,
      targetPrice,
      priceFloor,
    });

    return [{
      title: evalResult.title,
      price: `¥${evalResult.price}`,
      archetype: evalResult.archetype,
      category: evalResult.category,
      floor_price: `¥${evalResult.price_floor}`,
      is_accessory: evalResult.is_accessory ? '❌ 判定为配件/杂物' : '✅ 正常主商品',
      low_price_risk: evalResult.low_price_assessment.riskLevel,
      tier: evalResult.low_price_assessment.tier,
      action: evalResult.verdict_badge || evalResult.action,
      explanation: evalResult.explanation,
    }];
  },
});
