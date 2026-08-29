import { cli, Strategy } from '@jackwener/opencli/registry';
import { AuthRequiredError } from '@jackwener/opencli/errors';

export const command = cli({
  site: 'goofish',
  name: 'favorites',
  access: 'read',
  description: '查看闲鱼宝贝收藏列表 (支持分类Tab筛选、滚动翻页、降价监控、搜索)',
  domain: 'www.goofish.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'query', positional: true, required: false, help: '按收藏宝贝名称搜索筛选' },
    { name: 'limit', type: 'int', default: 30, help: '返回宝贝最大数量 (默认 30)' },
    { name: 'tab', type: 'str', default: '全部', help: '收藏分类Tab: 全部, 降价宝贝, 有效宝贝, 失效宝贝' },
    { name: 'all', type: 'bool', default: false, help: '是否全量滚动加载所有收藏宝贝' },
  ],
  columns: [
    'index',
    'item_id',
    'title',
    'price',
    'discount',
    'status',
    'item_url',
  ],
  func: async (page, kwargs) => {
    const limit = kwargs.all ? 1000 : (kwargs.limit || 30);
    const maxScrolls = kwargs.all ? 50 : Math.max(1, Math.ceil(limit / 10));
    const query = String(kwargs.query || '').trim().toLowerCase();
    const targetTab = String(kwargs.tab || '全部').trim();

    await page.goto('https://www.goofish.com/collection');
    await page.wait(3);

    const isAuth = await page.evaluate(() => {
      const text = document.body ? document.body.innerText : '';
      return text.includes('我的收藏') || text.includes('降价宝贝') || text.includes('有效宝贝') || text.includes('全部');
    });

    if (!isAuth) {
      throw new AuthRequiredError('goofish');
    }

    await page.evaluate((tabName) => {
      const tabs = Array.from(document.querySelectorAll('div, span, button')).filter(el => {
        const t = el.innerText ? el.innerText.trim() : '';
        return t === tabName && el.children.length === 0;
      });
      if (tabs.length > 0) {
        tabs[0].click();
      }
    }, targetTab);
    await page.wait(2.5);

    let prevCount = 0;
    let staleRounds = 0;

    for (let s = 0; s < maxScrolls; s++) {
      const currentCount = await page.evaluate(() => {
        return document.querySelectorAll('a[href*="item?id="]').length;
      });

      if (currentCount >= limit) break;

      if (currentCount === prevCount && prevCount > 0) {
        staleRounds++;
        if (staleRounds >= 3) break;
      } else {
        staleRounds = 0;
      }
      prevCount = currentCount;

      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.wait(1.5);
    }

    const rawItems = await page.evaluate(() => {
      const itemLinks = Array.from(document.querySelectorAll('a[href*="item?id="]'));
      
      return itemLinks.map((a) => {
        let itemId = '';
        try {
          itemId = new URL(a.href, window.location.origin).searchParams.get('id') || '';
        } catch (e) {}

        const titleEl = a.querySelector('div[class*="title--"], div[class*="name--"], div[class*="desc--"]');
        let title = titleEl && titleEl.innerText ? titleEl.innerText.trim() : '';
        if (!title) {
          const lines = (a.innerText || '').split('\n').map(s => s.trim()).filter(Boolean);
          const tCand = lines.find(l => !['取消收藏', '我想要', '¥', '￥'].includes(l) && !l.startsWith('¥') && !l.startsWith('￥') && !l.includes('收藏后'));
          title = tCand || lines[0] || '';
        }

        const priceEl = a.querySelector('div[class*="price--"], span[class*="price--"]');
        let price = priceEl && priceEl.innerText ? priceEl.innerText.replace(/\s+/g, '') : '';
        if (!price) {
          const pMatch = (a.innerText || '').match(/[¥￥]\s*([\d.]+)/);
          if (pMatch) price = '¥' + pMatch[1];
        }

        let discount = '-';
        const text = a.innerText || '';
        const discountMatch = text.match(/收藏后[降\s]*[¥￥]([\d.]+)/) || text.match(/降[¥￥]([\d.]+)/);
        if (discountMatch) {
          discount = '降¥' + discountMatch[1];
        }

        let status = '在售';
        if (text.includes('卖掉了') || a.querySelector('img[class*="itemStatus"]')) {
          status = '已卖出/失效';
        }

        return {
          item_id: itemId || '-',
          title: title.slice(0, 100),
          price: price.startsWith('¥') || price.startsWith('￥') ? price : (price ? '¥' + price : '-'),
          discount,
          status,
          item_url: a.href,
        };
      });
    });

    const seen = new Set();
    let deduplicated = [];
    for (const it of (rawItems || [])) {
      if (it.item_id && !seen.has(it.item_id)) {
        seen.add(it.item_id);
        deduplicated.push(it);
      }
    }

    if (query) {
      deduplicated = deduplicated.filter(i => i.title.toLowerCase().includes(query) || i.item_id.includes(query));
    }

    const sliced = deduplicated.slice(0, limit);
    return sliced.map((item, idx) => ({
      index: idx + 1,
      item_id: item.item_id,
      title: item.title,
      price: item.price,
      discount: item.discount,
      status: item.status,
      item_url: item.item_url,
    }));
  },
});
