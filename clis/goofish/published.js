import { cli, Strategy } from '@jackwener/opencli/registry';
import { safeGoto, checkAuth } from './_shared.js';

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
      const text = document.body ? document.body.innerText : '';
      const lines = text.split('\n').map(s => s.trim()).filter(Boolean);

      let startIndex = 0;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('信用及评价') && lines[i + 1] && /^\d+$/.test(lines[i + 1])) {
          startIndex = i + 2;
          break;
        }
      }

      const itemLines = lines.slice(startIndex);
      const items = [];
      let i = 0;

      while (i < itemLines.length) {
        if (['发闲置', '消息', 'APP', '反馈', '客服', '回顶部', '阿里巴巴集团'].some(stopWord => itemLines[i] && itemLines[i].includes(stopWord))) {
          break;
        }

        const title = itemLines[i];
        i++;

        let price = '¥0';
        let origPrice = '-';
        let status = '在售';

        if (i < itemLines.length && itemLines[i] === '¥') {
          i++;
          if (i < itemLines.length) {
            price = '¥' + itemLines[i];
            i++;
            if (i < itemLines.length && itemLines[i].startsWith('.')) {
              price += itemLines[i];
              i++;
            }
          }
        } else if (i < itemLines.length && (itemLines[i].startsWith('¥') || itemLines[i].startsWith('￥'))) {
          price = itemLines[i];
          i++;
        }

        if (i < itemLines.length && (itemLines[i].startsWith('¥') || itemLines[i].startsWith('￥'))) {
          origPrice = itemLines[i];
          i++;
        }

        let seller = '';
        if (i < itemLines.length && !itemLines[i].startsWith('¥') && !itemLines[i].startsWith('￥') && itemLines[i].length < 25) {
          seller = itemLines[i];
          i++;
        }

        if (title && title.length > 1 && !['¥', '￥', '编辑资料', '宝贝'].includes(title)) {
          items.push({
            title: title.slice(0, 100),
            price,
            original_price: origPrice,
            status,
            seller: seller || '-',
          });
        }
      }

      return items;
    });

    let filtered = rawItems || [];
    if (query) {
      filtered = filtered.filter(it => it.title.toLowerCase().includes(query) || it.seller.toLowerCase().includes(query));
    }

    return filtered.slice(0, limit).map((it, idx) => ({
      index: idx + 1,
      title: it.title,
      price: it.price,
      original_price: it.original_price,
      status: it.status,
      seller: it.seller,
    }));
  },
});
