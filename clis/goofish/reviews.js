import { cli, Strategy } from '@jackwener/opencli/registry';
import { 
  getSellerReview, 
  querySellerReviews, 
  syncSellerReviewsFromSessionsAndMessages 
} from './_db.js';

export const command = cli({
  site: 'goofish',
  name: 'reviews',
  access: 'read',
  description: '查看与管理卖家沟通与履约评估档案 (基于聊天记录自动分类: 活跃报价/已读不回/明确无货)',
  domain: 'www.goofish.com',
  strategy: Strategy.LOCAL,
  browser: false,
  args: [
    { name: 'seller', positional: true, required: false, help: '指定卖家昵称 (若不传则展示全部评估列表)' },
    { name: 'name', type: 'str', required: false, help: '卖家昵称筛选' },
    { name: 'status', type: 'str', required: false, help: '按状态过滤: responsive | ghosted | unfit | unknown' },
    { name: 'sync', type: 'bool', default: false, help: '是否先根据最近会话与聊天消息更新卖家评估档案' },
    { name: 'limit', type: 'int', default: 50, help: '返回数量上限 (默认 50)' },
  ],
  columns: [
    'seller',
    'status',
    'reason',
    'last_message',
    'interaction_count',
    'updated_at',
  ],
  func: async (first, second) => {
    const kwargs = (second && typeof second === 'object' && !second.isContext) ? second : (first || {});
    if (kwargs.sync) {
      syncSellerReviewsFromSessionsAndMessages();
    }

    const seller = String(kwargs.name || kwargs.seller || kwargs._?.[0] || '').trim();
    const status = String(kwargs.status || '').trim();
    const limit = Math.max(1, Math.min(Number(kwargs.limit) || 50, 500));

    if (seller) {
      const rev = getSellerReview(seller);
      if (!rev) return [];
      return [{
        seller: rev.seller,
        status: rev.status === 'responsive' 
          ? '✅ 活跃报价' 
          : (rev.status === 'ghosted' ? '⚠️ 曾已读不回' : (rev.status === 'unfit' ? '❌ 明确无货' : '❓ 未知')),
        reason: rev.reason || '-',
        last_message: rev.last_message || '-',
        interaction_count: String(rev.interaction_count || 1),
        updated_at: rev.updated_at || '-',
      }];
    }

    const rows = querySellerReviews({ status, limit });
    return rows.map((r) => ({
      seller: r.seller,
      status: r.status === 'responsive' 
        ? '✅ 活跃报价' 
        : (r.status === 'ghosted' ? '⚠️ 曾已读不回' : (r.status === 'unfit' ? '❌ 明确无货' : '❓ 未知')),
      reason: r.reason || '-',
      last_message: r.last_message || '-',
      interaction_count: String(r.interaction_count || 1),
      updated_at: r.updated_at || '-',
    }));
  },
});
