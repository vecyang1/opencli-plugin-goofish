import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError } from '@jackwener/opencli/errors';

export const command = cli({
  site: 'goofish',
  name: 'search',
  access: 'read',
  description: '在闲鱼全网搜索二手商品 (默认全国范围搜索，可选指定地区、排序、价格区间、8大官方标签、降价监控与分页)',
  domain: 'www.goofish.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'query', positional: true, required: true, help: '搜索关键词 (如: nexg2, 吉他, iPad, 显卡)' },
    { name: 'sort', type: 'str', default: '综合', help: '排序方式: 综合 (default), 新降价, 新发布, 价格, 价格升序, 价格降序' },
    { name: 'region', type: 'str', required: false, help: '可选地区筛选 (默认全国不限): 全国, 珠三角, 江浙沪, 京津冀, 东三省, 广东, 北京, 上海, 浙江等' },
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
    'price_drop',
    'publish_time',
    'location',
    'seller_tag',
    'condition',
    'guarantee',
    'item_url',
  ],
  func: async (page, kwargs) => {
    const query = String(kwargs.query || kwargs._?.[0] || '').trim();
    if (!query) {
      throw new ArgumentError('请指定要搜索的闲鱼关键词');
    }
    const limit = Math.max(1, Math.min(Number(kwargs.limit) || 30, 100));
    const sort = String(kwargs.sort || '综合').trim();
    const region = kwargs.region ? String(kwargs.region).trim() : '';
    const minPrice = kwargs['min-price'] ? String(kwargs['min-price']).trim() : '';
    const maxPrice = kwargs['max-price'] ? String(kwargs['max-price']).trim() : '';
    const tags = kwargs.tags ? String(kwargs.tags).split(/[,，]/).map(s => s.trim()).filter(Boolean) : [];
    const pageNum = Math.max(1, Number(kwargs['page-num']) || 1);

    const searchUrl = 'https://www.goofish.com/search?q=' + encodeURIComponent(query);
    await page.goto(searchUrl);
    await page.wait(4);

    // 1. Regional Filter (Only when explicitly specified, defaults to nationwide 全国)
    if (region && region !== '全国') {
      const regionClicked = await page.evaluate((targetRegion) => {
        const regBtn = Array.from(document.querySelectorAll('div, span, button')).find(el => {
          const t = (el.innerText || '').trim();
          return t === '区域' && el.children.length === 0;
        });
        if (regBtn) {
          regBtn.click();
          return true;
        }
        return false;
      }, region);

      if (regionClicked) {
        await page.wait(1.5);
        await page.evaluate((targetRegion) => {
          const items = Array.from(document.querySelectorAll('div, span, li, p')).filter(el => {
            const t = (el.innerText || '').trim();
            return (t === targetRegion || t.startsWith(targetRegion)) && el.children.length === 0;
          });
          if (items.length > 0) {
            items[items.length - 1].click();
          }

          const confirmBtn = Array.from(document.querySelectorAll('div, span, button')).find(el => {
            const t = (el.innerText || '').trim();
            return t.includes('查看') && t.includes('宝贝') && el.children.length === 0;
          });
          if (confirmBtn) confirmBtn.click();
        }, region);
        await page.wait(2.5);
      }
    }

    // 2. Sort selection
    if (sort && sort !== '综合' && sort !== 'default') {
      await page.evaluate((targetSort) => {
        let label = targetSort;
        if (label.includes('新发布')) label = '新发布';
        else if (label.includes('新降价')) label = '新降价';
        else if (label.includes('价格')) label = '价格';

        const sortTitles = Array.from(document.querySelectorAll('span, div')).filter(el => {
          const t = el.innerText ? el.innerText.trim() : '';
          return t === label && el.children.length <= 1;
        });
        if (sortTitles.length > 0) {
          sortTitles[0].click();
        }
      }, sort);
      await page.wait(2);
    }

    // 3. Price filter
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

    // 4. Tag filters
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

    // 5. Pagination jump
    if (pageNum > 1) {
      await page.evaluate((p) => {
        const pageInput = document.querySelector('input[class*="search-pagination-to-page-input--"], input[type="text"]');
        if (pageInput) {
          pageInput.value = String(p);
          pageInput.dispatchEvent(new Event('input', { bubbles: true }));
          pageInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        }
        const confirmPageBtn = Array.from(document.querySelectorAll('button, div, span')).find(el => el.innerText && el.innerText.trim() === '确定' && el.children.length === 0);
        if (confirmPageBtn) confirmPageBtn.click();
      }, pageNum);
      await page.wait(3);
    }

    // Wait for items to be present and scroll slightly
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
        if (!itemId) {
          const m = (a.href || '').match(/[?&]id=(\d+)/);
          if (m) itemId = m[1];
        }

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

        // Price drop badge
        let priceDrop = '-';
        const dropMatch = text.match(/累计降价[^\n| ]+/);
        if (dropMatch) priceDrop = dropMatch[0];
        else if (text.includes('降¥') || text.includes('降￥')) {
          const dMatch = text.match(/降[¥￥][\d.]+/);
          if (dMatch) priceDrop = dMatch[0];
        }

        // Publish time tag
        let publishTime = '-';
        const pubMatch = text.match(/(\d+分钟前发布|\d+小时前发布|\d+天前发布|刚刚发布|一周内发布)/);
        if (pubMatch) publishTime = pubMatch[1];

        // Service & Guarantee badges
        const guarantees = [];
        if (text.includes('描述不符包邮退')) guarantees.push('描述不符包邮退');
        if (text.includes('验货宝')) guarantees.push('验货宝');
        if (text.includes('验号担保')) guarantees.push('验号担保');
        if (text.includes('包邮')) guarantees.push('包邮');
        if (text.includes('可小刀')) guarantees.push('可小刀');

        // Location
        let location = '-';
        const provinces = ['北京', '上海', '广东', '浙江', '江苏', '山东', '四川', '湖北', '湖南', '陕西', '河南', '河北', '辽宁', '福建', '安徽', '重庆', '天津', '江西', '广西', '云南', '贵州', '山西', '吉林', '黑龙江', '内蒙古', '新疆', '甘肃', '海南', '宁夏', '青海', '西藏'];
        for (const prov of provinces) {
          if (lines.includes(prov) || text.includes(prov)) {
            location = prov;
            break;
          }
        }

        // Seller Tag
        let sellerTag = '-';
        if (text.includes('百分百好评')) sellerTag = '百分百好评';
        else if (text.includes('回头客超85%')) sellerTag = '回头客超85%';
        else if (text.includes('卖家信用极好')) sellerTag = '卖家信用极好';
        else if (text.includes('卖家信用优秀')) sellerTag = '卖家信用优秀';
        else if (text.includes('回复超快')) sellerTag = '回复超快';
        else if (text.includes('发货极快')) sellerTag = '发货极快';

        // Condition
        let condition = '-';
        if (text.includes('全新')) condition = '全新';
        else if (text.includes('几乎全新')) condition = '几乎全新';
        else if (text.includes('95新')) condition = '95新';
        else if (text.includes('轻微使用痕迹')) condition = '轻微使用痕迹';
        else if (text.includes('9成新')) condition = '9成新';

        let title = lines.find(l => l.length > 6 && !l.includes('想要') && !l.includes('信用') && !l.includes('回复') && !l.includes('发货') && !l.includes('累计降价') && !l.includes('发布') && !provinces.includes(l) && !l.startsWith('¥') && !l.startsWith('￥')) || lines[0] || '';

        return {
          item_id: itemId || '-',
          title: title.slice(0, 120),
          price: price || '¥0',
          original_price: origPrice,
          price_drop: priceDrop,
          publish_time: publishTime,
          location: location,
          seller_tag: sellerTag,
          condition: condition,
          guarantee: guarantees.join(' · ') || '普通',
          item_url: a.href,
        };
      });
    });

    const seen = new Set();
    let deduplicated = [];
    for (const it of (items || [])) {
      const key = it.item_id !== '-' ? it.item_id : (it.title + '_' + it.price);
      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push(it);
      }
    }

    return deduplicated.slice(0, limit).map((item, idx) => ({
      index: idx + 1,
      item_id: item.item_id,
      title: item.title,
      price: item.price,
      original_price: item.original_price,
      price_drop: item.price_drop,
      publish_time: item.publish_time,
      location: item.location,
      seller_tag: item.seller_tag,
      condition: item.condition,
      guarantee: item.guarantee,
      item_url: item.item_url,
    }));
  },
});
