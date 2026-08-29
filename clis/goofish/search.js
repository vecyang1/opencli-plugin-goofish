import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError } from '@jackwener/opencli/errors';

export const command = cli({
  site: 'goofish',
  name: 'search',
  access: 'read',
  description: '在闲鱼全网搜索二手商品 (返回标题、价格、想要人数、发货地、成色及卖家信用)',
  domain: 'www.goofish.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'query', positional: true, required: true, help: '搜索关键词 (如: 吉他, 显卡, iPad, 演唱会)' },
    { name: 'limit', type: 'int', default: 30, help: '返回结果最大数量 (默认 30)' },
  ],
  columns: [
    'index',
    'item_id',
    'title',
    'price',
    'want_count',
    'location',
    'seller_tag',
    'condition',
    'item_url',
  ],
  func: async (page, kwargs) => {
    const query = String(kwargs.query || kwargs._?.[0] || '').trim();
    if (!query) {
      throw new ArgumentError('请指定要搜索的闲鱼关键词');
    }
    const limit = Math.max(1, Math.min(Number(kwargs.limit) || 30, 100));

    await page.goto('https://www.goofish.com/search?q=' + encodeURIComponent(query));
    await page.wait(5);

    for (let retry = 0; retry < 5; retry++) {
      const hasLinks = await page.evaluate(() => document.querySelectorAll('a[href*="item?id="]').length > 0);
      if (hasLinks) break;
      await page.evaluate(() => window.scrollBy(0, 500));
      await page.wait(1.5);
    }

    const items = await page.evaluate(() => {
      const itemLinks = Array.from(document.querySelectorAll('a[href*="item?id="]'));
      
      return itemLinks.map((a) => {
        let itemId = '';
        try {
          itemId = new URL(a.href, window.location.origin).searchParams.get('id') || '';
        } catch (e) {}

        const text = a.innerText || '';
        const lines = text.split('\n').map(s => s.trim()).filter(Boolean);

        let price = '';
        for (let i = 0; i < lines.length; i++) {
          if ((lines[i] === '¥' || lines[i] === '￥') && lines[i + 1]) {
            price = '¥' + lines[i + 1];
            if (lines[i + 2] && lines[i + 2].startsWith('.')) {
              price += lines[i + 2];
            }
            break;
          }
        }
        if (!price) {
          const pMatch = text.match(/[¥￥]\s*([\d.]+)/);
          if (pMatch) price = '¥' + pMatch[1];
        }

        let wantCount = '-';
        const wantMatch = text.match(/(\d+人想要)/);
        if (wantMatch) wantCount = wantMatch[1];

        let location = '-';
        const provinces = ['北京', '上海', '广东', '浙江', '江苏', '山东', '四川', '湖北', '湖南', '陕西', '河南', '河北', '辽宁', '福建', '安徽', '重庆', '天津', '江西', '广西', '云南', '贵州', '山西', '吉林', '黑龙江', '内蒙古', '新疆', '甘肃', '海南', '宁夏', '青海', '西藏'];
        for (const prov of provinces) {
          if (lines.includes(prov)) {
            location = prov;
            break;
          }
        }

        let sellerTag = '-';
        if (text.includes('回复超快')) sellerTag = '回复超快';
        else if (text.includes('卖家信用极好')) sellerTag = '卖家信用极好';
        else if (text.includes('卖家信用优秀')) sellerTag = '卖家信用优秀';

        let condition = '-';
        if (text.includes('全新')) condition = '全新';
        else if (text.includes('几乎全新')) condition = '几乎全新';
        else if (text.includes('95新')) condition = '95新';
        else if (text.includes('9成新')) condition = '9成新';

        let title = lines.find(l => l.length > 6 && !l.includes('想要') && !l.includes('信用') && !l.includes('回复') && !provinces.includes(l) && !l.startsWith('¥') && !l.startsWith('￥')) || lines[0] || '';

        return {
          item_id: itemId || '-',
          title: title.slice(0, 100),
          price: price || '¥0',
          want_count: wantCount,
          location: location,
          seller_tag: sellerTag,
          condition: condition,
          item_url: a.href,
        };
      });
    });

    const seen = new Set();
    let deduplicated = [];
    for (const it of (items || [])) {
      if (it.item_id && it.item_id !== '-' && !seen.has(it.item_id)) {
        seen.add(it.item_id);
        deduplicated.push(it);
      }
    }

    return deduplicated.slice(0, limit).map((item, idx) => ({
      index: idx + 1,
      item_id: item.item_id,
      title: item.title,
      price: item.price,
      want_count: item.want_count,
      location: item.location,
      seller_tag: item.seller_tag,
      condition: item.condition,
      item_url: item.item_url,
    }));
  },
});
