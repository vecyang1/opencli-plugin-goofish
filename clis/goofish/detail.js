import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError, CommandExecutionError } from '@jackwener/opencli/errors';

export const command = cli({
  site: 'goofish',
  name: 'detail',
  access: 'read',
  description: '获取闲鱼商品详情 (标题、售价、卖家信誉档案、想要/浏览数、规格及描述)',
  domain: 'www.goofish.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'id', positional: true, required: true, help: '闲鱼商品 ID (如: 1059195860101)' },
  ],
  columns: [
    'item_id',
    'title',
    'price',
    'seller',
    'location',
    'seller_stats',
    'want_count',
    'browse_count',
    'specs',
    'description',
  ],
  func: async (page, kwargs) => {
    let itemId = String(kwargs.id || '').trim();
    if (itemId.startsWith('http')) {
      try {
        itemId = new URL(itemId).searchParams.get('id') || itemId;
      } catch (e) {}
    }

    if (!itemId) {
      throw new ArgumentError('请指定要查询的闲鱼商品 ID');
    }

    await page.goto('https://www.goofish.com/item?id=' + itemId);
    await page.wait(4);

    const data = await page.evaluate(() => {
      const text = document.body ? document.body.innerText : '';
      if (text.includes('网络不见了') || text.includes('快停止散发魅力')) {
        return { ok: false, error: 'item_offline_or_not_found', message: '商品已下架或不存在' };
      }

      const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
      let title = document.title ? document.title.replace(/_闲鱼$/, '').trim() : '';

      let seller = '';
      let location = '-';
      let sellerStatsArr = [];

      for (let i = 0; i < Math.min(lines.length, 25); i++) {
        const l = lines[i];
        if (l.includes('来闲鱼') || l.includes('卖出') || l.includes('好评率')) {
          sellerStatsArr.push(l);
          if (!seller && i > 0) {
            seller = lines[i - 2] || lines[i - 1];
          }
        }
        if (['北京', '上海', '广州', '深圳', '杭州', '成都', '武汉', '南京', '重庆', '西安', '苏州', '天津', '长沙'].includes(l)) {
          location = l;
        }
      }

      let price = '¥0';
      const priceMatch = text.match(/直接买\s*[￥¥]\s*([\d.]+)/) || text.match(/[¥￥]\s*([\d.]+)/);
      if (priceMatch) price = '¥' + priceMatch[1];

      let wantCount = '-';
      let browseCount = '-';
      const wantMatch = text.match(/(\d+人想要)/);
      if (wantMatch) wantCount = wantMatch[1];
      const browseMatch = text.match(/(\d+浏览)/);
      if (browseMatch) browseCount = browseMatch[1];

      let specs = '-';
      const specMatch = text.match(/(分类：[^\n]+)/);
      if (specMatch) specs = specMatch[1];

      let descStart = lines.findIndex(l => l.includes('浏览') || l.includes('想要'));
      let descEnd = lines.findIndex(l => l === '聊一聊' || l === '立即购买' || l.includes('为你推荐'));
      let description = '';
      if (descStart >= 0) {
        const endIdx = descEnd > descStart ? descEnd : descStart + 15;
        description = lines.slice(descStart + 1, endIdx).filter(l => !['展开', '收起', '担保交易', '举报', '收藏'].includes(l)).join('\n');
      }

      return {
        ok: true,
        title: title || '闲鱼商品',
        price,
        seller: seller || '闲鱼卖家',
        location,
        seller_stats: sellerStatsArr.join(' · ') || '正常卖家',
        want_count: wantCount,
        browse_count: browseCount,
        specs,
        description: description.slice(0, 300) || '-',
      };
    });

    if (!data || data.ok === false) {
      throw new CommandExecutionError('查询商品详情失败: ' + (data ? data.message : '商品可能已失效或下架'));
    }

    return [{
      item_id: itemId,
      title: data.title,
      price: data.price,
      seller: data.seller,
      location: data.location,
      seller_stats: data.seller_stats,
      want_count: data.want_count,
      browse_count: data.browse_count,
      specs: data.specs,
      description: data.description,
    }];
  },
});
