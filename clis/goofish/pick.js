import { cli, Strategy } from '@jackwener/opencli/registry';
import { safeGoto } from './_shared.js';
import { 
  saveCandidates, 
  queryCandidates, 
  syncSellerReviewsFromSessionsAndMessages 
} from './_db.js';
import { isAccessoryTitle } from './_contract.js';

export const command = cli({
  site: 'goofish',
  name: 'pick',
  access: 'read',
  description: '闲鱼高性价比商品智能选购与多维博弈决策引擎 (全自动跨品类搜索、比价、排除配件与沟通风控过滤，推荐最优底价)',
  domain: 'www.goofish.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'target', positional: true, required: false, default: 'all', help: '目标品类: nexg2_nylon | lava_me_air | lava_me_4 | all' },
    { name: 'min-price', type: 'str', help: '自定义最低价格过滤' },
    { name: 'max-price', type: 'str', help: '自定义最高价格过滤' },
    { name: 'limit', type: 'int', default: 20, help: '单品类线上抓取数量上限 (默认 20)' },
  ],
  columns: [
    'category',
    'best_item_id',
    'lowest_price',
    'seller',
    'seller_status',
    'title',
    'location',
    'item_url',
  ],
  func: async (page, kwargs) => {
    const target = String(kwargs.target || kwargs._?.[0] || 'all').toLowerCase();
    const limit = Math.max(5, Math.min(Number(kwargs.limit) || 20, 50));

    // 1. Refresh seller reviews from chat records
    syncSellerReviewsFromSessionsAndMessages();

    // 2. Determine target search configs
    const searchConfigs = [];
    if (target === 'all' || target.includes('nexg')) {
      searchConfigs.push({
        category: 'nexg2_nylon',
        keyword: 'nexg 2n',
        minPrice: kwargs['min-price'] || '1000',
        maxPrice: kwargs['max-price'] || '3800',
      });
      searchConfigs.push({
        category: 'nexg2_nylon',
        keyword: 'nexg2 尼龙',
        minPrice: kwargs['min-price'] || '1000',
        maxPrice: kwargs['max-price'] || '3800',
      });
    }
    if (target === 'all' || target.includes('air')) {
      searchConfigs.push({
        category: 'lava_me_air',
        keyword: 'lava me air',
        minPrice: kwargs['min-price'] || '1000',
        maxPrice: kwargs['max-price'] || '3200',
      });
    }
    if (target === 'all' || target.includes('me4') || target.includes('me 4') || target.includes('lava 4')) {
      searchConfigs.push({
        category: 'lava_me_4',
        keyword: 'lava me 4',
        minPrice: kwargs['min-price'] || '1400',
        maxPrice: kwargs['max-price'] || '3800',
      });
    }

    for (const sc of searchConfigs) {
      const searchUrl = 'https://www.goofish.com/search?q=' + encodeURIComponent(sc.keyword);
      await safeGoto(page, searchUrl);

      // Set price inputs
      if (sc.minPrice || sc.maxPrice) {
        await page.evaluate(({ min, max }) => {
          const priceInputs = Array.from(document.querySelectorAll('input[placeholder*="最低价"], input[placeholder*="最高价"], input[type="number"]'));
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          if (priceInputs.length >= 2) {
            if (min) {
              if (setter) setter.call(priceInputs[0], min); else priceInputs[0].value = min;
              priceInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
              priceInputs[0].dispatchEvent(new Event('change', { bubbles: true }));
            }
            if (max) {
              if (setter) setter.call(priceInputs[1], max); else priceInputs[1].value = max;
              priceInputs[1].dispatchEvent(new Event('input', { bubbles: true }));
              priceInputs[1].dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
          const btn = document.querySelector('button[class*="search-price-confirm-button--"]') ||
            Array.from(document.querySelectorAll('button, div, span')).find(el => (el.innerText || '').trim() === '确定' && el.children.length === 0);
          if (btn) btn.click();
        }, { min: sc.minPrice, max: sc.maxPrice });
        await page.wait(2);
      }

      // Extract search result cards
      const rawCards = await page.evaluate((maxItems) => {
        const itemLinks = Array.from(document.querySelectorAll('a[href*="item?id="]')).slice(0, maxItems);
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
          for (let i = 0; i < lines.length; i++) {
            if ((lines[i] === '¥' || lines[i] === '￥') && lines[i + 1]) {
              price = '¥' + lines[i + 1];
              break;
            }
          }
          if (!price) {
            const pMatch = text.match(/[¥￥]\s*([\d.]+)/);
            if (pMatch) price = '¥' + pMatch[1];
          }

          let location = '-';
          const locEl = a.querySelector('div[class*="seller-text--"], div[class*="seller-left--"], span[class*="seller-text--"]');
          if (locEl && locEl.innerText) location = locEl.innerText.trim();

          let seller = '-';
          const sellerEl = a.querySelector('div[class*="seller-name--"], div[class*="seller-nick--"], span[class*="seller-name--"]');
          if (sellerEl && sellerEl.innerText) seller = sellerEl.innerText.trim();

          let title = '';
          const titleEl = a.querySelector('div[class*="row--"], div[class*="title--"], span[class*="title--"]');
          if (titleEl && titleEl.innerText) {
            title = titleEl.innerText.trim();
          } else if (lines.length > 0) {
            title = lines.find(l => l.length > 5 && !l.startsWith('¥') && !l.startsWith('降')) || lines[0];
          }

          return {
            item_id: itemId,
            title,
            price: price || '¥0',
            location,
            seller,
            item_url: a.href,
          };
        });
      }, limit);

      // Filter out accessories via contract
      const validGuitars = (rawCards || []).filter(it => !isAccessoryTitle(it.title, sc.category));

      // Write valid items to SQLite SSOT
      if (validGuitars.length > 0) {
        saveCandidates(validGuitars, { keyword: sc.keyword, category: sc.category, filterAccessories: true });
      }
    }

    // Unidirectional Data Flow: Re-read authoritative candidates from SQLite view
    const targetCategories = target === 'all' 
      ? ['nexg2_nylon', 'lava_me_air', 'lava_me_4'] 
      : [target.includes('nexg') ? 'nexg2_nylon' : (target.includes('air') ? 'lava_me_air' : 'lava_me_4')];

    const results = [];
    for (const cat of targetCategories) {
      const candidates = queryCandidates({ category: cat, excludeGhosted: true, sort: 'price_asc', limit: 10 });
      const best = candidates[0] || null;
      if (best) {
        results.push({
          category: cat,
          best_item_id: best.item_id,
          lowest_price: best.price,
          seller: best.seller,
          seller_status: best.seller_status === 'responsive' 
            ? '✅ 活跃报价' 
            : (best.seller_status === 'ghosted' ? '⚠️ 曾已读不回' : (best.seller_status === 'unfit' ? '❌ 明确无货' : '❓ 待深入沟通')),
          title: best.title,
          location: best.location,
          item_url: best.item_url,
        });
      }
    }

    return results;
  },
});
