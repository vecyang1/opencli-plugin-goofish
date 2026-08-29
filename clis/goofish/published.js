import { cli, Strategy } from '@jackwener/opencli/registry';
import { AuthRequiredError } from '@jackwener/opencli/errors';

export const command = cli({
  site: 'goofish',
  name: 'published',
  access: 'read',
  description: '获取闲鱼个人发布的宝贝列表 (包含在售与已卖出商品、价格、原价及状态)',
  domain: 'www.goofish.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'query', positional: true, required: false, help: '按商品标题搜索筛选' },
    { name: 'limit', type: 'int', default: 30, help: '返回宝贝最大数量 (默认 30)' },
    { name: 'all', type: 'bool', default: false, help: '是否全量滚动加载所有发布的宝贝' },
  ],
  columns: [
    'index',
    'title',
    'price',
    'original_price',
    'status',
    'seller',
  ],
  func: async (page, kwargs) => {
    const limit = kwargs.all ? 500 : (kwargs.limit || 30);
    const maxScrolls = kwargs.all ? 30 : Math.max(1, Math.ceil(limit / 10));
    const query = String(kwargs.query || '').trim().toLowerCase();

    await page.goto('https://www.goofish.com/personal');
    await page.wait(4);

    const isAuth = await page.evaluate(() => {
      const text = document.body ? document.body.innerText : '';
      return text.includes('编辑资料') || text.includes('宝贝') || text.includes('信用及评价') || text.includes('Vector_Y');
    });

    if (!isAuth) {
      throw new AuthRequiredError('goofish');
    }

    for (let s = 0; s < maxScrolls; s++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.wait(1.5);
    }

    const rawItems = await page.evaluate(() => {
      const text = document.body ? document.body.innerText : '';
      const lines = text.split('\n').map(s => s.trim()).filter(Boolean);

      let startIndex = 0;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('信用及评价') && lines[i + 1] && lines[i + 1].match(/^\d+$/)) {
          startIndex = i + 2;
          break;
        }
      }

      const itemLines = lines.slice(startIndex);
      const parsed = [];
      let cur = null;

      for (let i = 0; i < itemLines.length; i++) {
        const l = itemLines[i];
        if (['发闲置', '消息', 'APP', '反馈', '客服', '回顶部', '阿里巴巴集团'].includes(l)) {
          break;
        }

        if (l === '¥' || l === '￥') {
          if (cur && itemLines[i + 1]) {
            cur.price = '¥' + itemLines[i + 1];
            if (itemLines[i + 2] && itemLines[i + 2].startsWith('¥')) {
              cur.original_price = itemLines[i + 2];
            }
          }
        } else if (l === 'Vector_Y' || l.includes('Vector_')) {
          if (cur && cur.title) {
            parsed.push(cur);
          }
          cur = null;
        } else if (!cur && l.length > 2 && !l.startsWith('¥') && !l.startsWith('￥')) {
          cur = {
            title: l,
            price: '¥0',
            original_price: '-',
            status: '在售',
            seller: 'Vector_Y',
          };
        }
      }
      if (cur && cur.title) parsed.push(cur);
      return parsed;
    });

    const seen = new Set();
    let deduplicated = [];
    for (const it of (rawItems || [])) {
      if (!seen.has(it.title)) {
        seen.add(it.title);
        deduplicated.push(it);
      }
    }

    if (query) {
      deduplicated = deduplicated.filter(i => i.title.toLowerCase().includes(query));
    }

    const sliced = deduplicated.slice(0, limit);
    return sliced.map((item, idx) => ({
      index: idx + 1,
      title: item.title,
      price: item.price,
      original_price: item.original_price,
      status: item.status,
      seller: item.seller,
    }));
  },
});
