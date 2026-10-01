import { cli, Strategy } from '@jackwener/opencli/registry';
import { safeGoto, checkAuth } from './_shared.js';

export const command = cli({
  site: 'goofish',
  name: 'sold',
  access: 'read',
  description: '获取闲鱼卖家已卖出的宝贝记录 (我卖出的历史订单与成交价格)',
  domain: 'www.goofish.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'query', positional: true, required: false, help: '按商品标题搜索筛选' },
    { name: 'limit', type: 'int', default: 30, help: '返回宝贝最大数量 (默认 30)' },
    { name: 'all', type: 'bool', default: false, help: '是否全量滚动加载所有已售宝贝' },
  ],
  columns: [
    'index',
    'item_id',
    'title',
    'price',
    'original_price',
    'status',
    'item_url',
  ],
  func: async (page, kwargs) => {
    const limit = kwargs.all ? 500 : (Number(kwargs.limit) || 30);
    const maxScrolls = kwargs.all ? 30 : Math.max(1, Math.ceil(limit / 10));
    const query = String(kwargs.query || '').trim().toLowerCase();

    await safeGoto(page, 'https://www.goofish.com/personal');
    await checkAuth(page);

    for (let s = 0; s < maxScrolls; s++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.wait(1.5);
    }

    const rawItems = await page.evaluate(() => {
      const allLinks = Array.from(document.querySelectorAll('a[href*="id="], a[href*="item"], div[data-item-id]'));
      const itemLinks = allLinks.filter(el => {
        const href = el.href || el.getAttribute('data-href') || '';
        return /item\?id=\d+/.test(href) || /[?&]id=\d+/.test(href) || el.getAttribute('data-item-id');
      });

      const seenIds = new Set();
      const extracted = [];

      for (const el of itemLinks) {
        const href = el.href || el.getAttribute('data-href') || '';
        let itemId = el.getAttribute('data-item-id') || '';
        if (!itemId) {
          const m = href.match(/[?&]id=(\d+)/);
          if (m) itemId = m[1];
        }
        if (!itemId || seenIds.has(itemId)) continue;

        const text = el.innerText || '';
        // Only keep sold items
        if (!text.includes('已卖出')) continue;

        seenIds.add(itemId);
        const lines = text.split('\n').map(s => s.trim()).filter(Boolean);

        let price = '¥0';
        let origPrice = '-';
        for (let i = 0; i < lines.length; i++) {
          if ((lines[i] === '¥' || lines[i] === '￥') && lines[i + 1]) {
            price = '¥' + lines[i + 1];
            if (lines[i + 2] && lines[i + 2].startsWith('.')) {
              price += lines[i + 2];
            }
            if (lines[i + 3] && lines[i + 3].startsWith('¥')) {
              origPrice = lines[i + 3];
            }
            break;
          }
        }
        if (price === '¥0') {
          const pMatch = text.match(/[¥￥]\s*([\d.]+)/);
          if (pMatch) price = '¥' + pMatch[1];
        }

        let title = lines.find(l => l.length > 3 && !l.startsWith('¥') && !l.startsWith('￥') && !['在售', '已卖出', '下架', '编辑'].includes(l)) || lines[0] || '闲鱼宝贝';

        extracted.push({
          item_id: itemId,
          item_url: `https://www.goofish.com/item?id=${itemId}`,
          title: title.slice(0, 100),
          price,
          original_price: origPrice,
          status: '已卖出',
        });
      }

      return extracted;
    });

    let filtered = rawItems || [];
    if (query) {
      filtered = filtered.filter(it => it.title.toLowerCase().includes(query) || (it.item_id && it.item_id.includes(query)));
    }

    return filtered.slice(0, limit).map((it, idx) => ({
      index: idx + 1,
      item_id: it.item_id || '-',
      title: it.title,
      price: it.price,
      original_price: it.original_price,
      status: it.status,
      item_url: it.item_url || '-',
    }));
  },
});
