import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError } from '@jackwener/opencli/errors';

export const command = cli({
  site: 'goofish',
  name: 'search',
  access: 'read',
  description: '在闲鱼全网搜索二手商品 (支持排序、价格区间、标签筛选、分页)',
  domain: 'www.goofish.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'query', positional: true, required: true, help: '搜索关键词 (如: 吉他, 显卡, iPad, 演唱会)' },
    { name: 'sort', type: 'str', default: '综合', help: '排序方式: 综合 (default), 新降价, 新发布, 价格' },
    { name: 'min-price', type: 'str', required: false, help: '最低价格筛选 (如: 50)' },
    { name: 'max-price', type: 'str', required: false, help: '最高价格筛选 (如: 500)' },
    { name: 'tags', type: 'str', required: false, help: '标签筛选，英文逗号分隔 (个人闲置, 验货宝, 验号担保, 包邮, 超赞鱼小铺, 全新, 严选, 转卖)' },
    { name: 'page-num', type: 'int', default: 1, help: '指定翻页页码 (1-50)' },
    { name: 'limit', type: 'int', default: 30, help: '返回结果最大数量 (默认 30)' },
  ],
  columns: [
    'index',
    'item_id',
    'title',
    'price',
    'original_price',
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
    const sort = String(kwargs.sort || '综合').trim();
    const minPrice = kwargs['min-price'] ? String(kwargs['min-price']).trim() : '';
    const maxPrice = kwargs['max-price'] ? String(kwargs['max-price']).trim() : '';
    const tags = kwargs.tags ? String(kwargs.tags).split(/[,，]/).map(s => s.trim()).filter(Boolean) : [];
    const pageNum = Math.max(1, Number(kwargs['page-num']) || 1);

    await page.goto('https://www.goofish.com/search?q=' + encodeURIComponent(query));
    await page.wait(4);

    // 1. Sort selection
    if (sort && sort !== '综合' && sort !== 'default') {
      await page.evaluate((targetSort) => {
        const sortTitles = Array.from(document.querySelectorAll('span, div')).filter(el => {
          const t = el.innerText ? el.innerText.trim() : '';
          return (t === targetSort || (targetSort.includes('新发布') && t === '新发布') || (targetSort.includes('新降价') && t === '新降价') || (targetSort.includes('价格') && t === '价格')) && el.children.length <= 1;
        });
        if (sortTitles.length > 0) {
          sortTitles[0].click();
        }
      }, sort);
      await page.wait(2);
    }

    // 2. Price filter
    if (minPrice || maxPrice) {
      await page.evaluate(({ min, max }) => {
        const priceInputs = Array.from(document.querySelectorAll('input[class*="search-price-input--"]'));
        if (priceInputs.length >= 2) {
          if (min) {
            priceInputs[0].value = min;
            priceInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
            priceInputs[0].dispatchEvent(new Event('change', { bubbles: true }));
          }
          if (max) {
            priceInputs[1].value = max;
            priceInputs[1].dispatchEvent(new Event('input', { bubbles: true }));
            priceInputs[1].dispatchEvent(new Event('change', { bubbles: true }));
          }
          const confirmBtn = Array.from(document.querySelectorAll('div, span, button')).find(el => {
            return el.innerText && el.innerText.trim() === '确定' && el.children.length === 0;
          });
          if (confirmBtn) confirmBtn.click();
        }
      }, { min: minPrice, max: maxPrice });
      await page.wait(2.5);
    }

    // 3. Tag filters
    if (tags.length > 0) {
      for (const tag of tags) {
        await page.evaluate((targetTag) => {
          const labels = Array.from(document.querySelectorAll('span[class*="search-checkbox-label--"], span, div')).filter(el => {
            return el.innerText && el.innerText.trim() === targetTag && el.children.length === 0;
          });
          if (labels.length > 0) {
            labels[0].click();
          }
        }, tag);
        await page.wait(1.5);
      }
    }

    // 4. Pagination
    if (pageNum > 1) {
      await page.evaluate((p) => {
        const pageInput = document.querySelector('input[class*="search-pagination-to-page-input--"]');
        if (pageInput) {
          pageInput.value = String(p);
          pageInput.dispatchEvent(new Event('input', { bubbles: true }));
          pageInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        }
      }, pageNum);
      await page.wait(3);
    }

    // Wait for items to be present
    for (let retry = 0; retry < 5; retry++) {
      const hasLinks = await page.evaluate(() => document.querySelectorAll('a[href*="item?id="]').length > 0);
      if (hasLinks) break;
      await page.evaluate(() => window.scrollBy(0, 600));
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
        else if (text.includes('发货极快')) sellerTag = '发货极快';
        else if (text.includes('卖家信用极好')) sellerTag = '卖家信用极好';
        else if (text.includes('卖家信用优秀')) sellerTag = '卖家信用优秀';

        let condition = '-';
        if (text.includes('全新')) condition = '全新';
        else if (text.includes('几乎全新')) condition = '几乎全新';
        else if (text.includes('95新')) condition = '95新';
        else if (text.includes('9成新')) condition = '9成新';

        let title = lines.find(l => l.length > 6 && !l.includes('想要') && !l.includes('信用') && !l.includes('回复') && !l.includes('发货') && !provinces.includes(l) && !l.startsWith('¥') && !l.startsWith('￥')) || lines[0] || '';

        return {
          item_id: itemId || '-',
          title: title.slice(0, 120),
          price: price || '¥0',
          original_price: origPrice,
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
      original_price: item.original_price,
      want_count: item.want_count,
      location: item.location,
      seller_tag: item.seller_tag,
      condition: item.condition,
      item_url: item.item_url,
    }));
  },
});
