import { cli, Strategy } from '@jackwener/opencli/registry';
import { safeGoto } from './_shared.js';
import { 
  saveCandidates, 
  queryCandidates, 
  syncSellerReviewsFromSessionsAndMessages 
} from './_db.js';
import { isAccessoryTitle, inferCategory, getProductSpec, assessLowPriceTrap } from './_contract.js';

export const command = cli({
  site: 'goofish',
  name: 'pick',
  access: 'read',
  description: '闲鱼高性价比商品智能选购与多维博弈决策引擎 (全自动跨品类搜索、比价、排除配件/噪音与沟通风控过滤，推荐最优底价)',
  domain: 'www.goofish.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'target', positional: true, required: false, default: 'all', help: '目标品类/搜索关键词: nexg | air | me4 | all | 或任意关键词 (如: "绿联 15375", "索尼 a7m4", "switch oled")' },
    { name: 'category', type: 'str', help: '自定义品类标识 (如: ugreen_hub, tablet, nexg2_nylon, sony_a7m4)' },
    { name: 'require', type: 'str', help: '必须包含的正向关键词，逗号分隔 (如: 尼龙,2N 或 4K60,千兆 或 2.5K,16384)' },
    { name: 'min-price', type: 'str', help: '自定义最低价格过滤' },
    { name: 'max-price', type: 'str', help: '自定义最高价格过滤' },
    { name: 'exclude', type: 'str', help: '自定义排除关键词，逗号分隔 (如: 6合1,自提,配件,损坏)' },
    { name: 'sort', type: 'str', default: '价格升序', help: '排序方式: 价格升序 (default), 综合, 新发布, 价格降序' },
    { name: 'limit', type: 'int', default: 20, help: '单品类抓取数量上限 (默认 20)' },
  ],
  columns: [
    'category',
    'best_item_id',
    'lowest_price',
    'condition',
    'defect_notes',
    'seller',
    'seller_status',
    'title',
    'location',
    'item_url',
  ],
  func: async (page, kwargs) => {
    const rawTarget = String(kwargs.target || kwargs._?.[0] || 'all').trim();
    const targetLower = rawTarget.toLowerCase();
    const limit = Math.max(5, Math.min(Number(kwargs.limit) || 20, 50));
    const customExclude = kwargs.exclude ? String(kwargs.exclude).split(/[,，]/).map(s => s.trim()).filter(Boolean) : [];
    const customRequire = kwargs.require ? String(kwargs.require).split(/[,，]/).map(s => s.trim()).filter(Boolean) : [];

    // 1. Refresh seller reviews from chat records
    try {
      syncSellerReviewsFromSessionsAndMessages();
    } catch (e) {}

    // 2. Determine target search configs (extensible & generic across all product lines)
    const searchConfigs = [];
    const explicitCat = kwargs.category ? String(kwargs.category).trim() : '';

    if (targetLower === 'all' || targetLower === '全部') {
      if (explicitCat) {
        const spec = getProductSpec(explicitCat);
        searchConfigs.push({
          category: explicitCat,
          keyword: spec ? spec.defaultQuery : explicitCat,
          minPrice: kwargs['min-price'] || (spec?.priceFloor ? String(spec.priceFloor) : ''),
          maxPrice: kwargs['max-price'] || '',
          exclude: customExclude,
          require: customRequire,
        });
      } else {
        // Multi-category defaults across guitars and 3C
        searchConfigs.push({
          category: 'nexg2_nylon',
          keyword: 'nexg 2n',
          minPrice: kwargs['min-price'] || '1000',
          maxPrice: kwargs['max-price'] || '3800',
          exclude: customExclude,
          require: customRequire,
        });
        searchConfigs.push({
          category: 'lava_me_air',
          keyword: 'lava me air',
          minPrice: kwargs['min-price'] || '1000',
          maxPrice: kwargs['max-price'] || '3200',
          exclude: customExclude,
          require: customRequire,
        });
        searchConfigs.push({
          category: 'lava_me_4',
          keyword: 'lava me 4',
          minPrice: kwargs['min-price'] || '1400',
          maxPrice: kwargs['max-price'] || '3800',
          exclude: customExclude,
          require: customRequire,
        });
        searchConfigs.push({
          category: 'ugreen_hub',
          keyword: '绿联 15375',
          minPrice: kwargs['min-price'] || '60',
          maxPrice: kwargs['max-price'] || '160',
          exclude: customExclude,
          require: customRequire,
        });
      }
    } else {
      // General purpose product or specific category search
      const spec = getProductSpec(explicitCat || rawTarget);
      const cat = explicitCat || (spec ? spec.category : inferCategory({ keyword: rawTarget, title: rawTarget }));
      const kw = rawTarget;
      searchConfigs.push({
        category: cat,
        keyword: kw,
        minPrice: kwargs['min-price'] || (spec?.priceFloor ? String(spec.priceFloor) : ''),
        maxPrice: kwargs['max-price'] || '',
        exclude: customExclude,
        require: customRequire,
      });
    }

    for (const sc of searchConfigs) {
      const searchUrl = 'https://www.goofish.com/search?q=' + encodeURIComponent(sc.keyword);
      await safeGoto(page, searchUrl);

      // Set price inputs
      if (sc.minPrice || sc.maxPrice) {
        await page.evaluate(({ min, max }) => {
          const priceInputs = Array.from(document.querySelectorAll('input[class*="search-price-input--"], input[placeholder*="最低价"], input[placeholder*="最高价"], input[type="number"]'));
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

      // Wait for item cards with hydration polling
      for (let r = 0; r < 5; r++) {
        const count = await page.evaluate(() => document.querySelectorAll('a[href*="item?id="]').length);
        if (count > 0) break;
        await page.evaluate(() => window.scrollBy(0, 500));
        await page.wait(1.5);
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
              price = lines[i + 1];
              if (lines[i + 2] && lines[i + 2].startsWith('.')) {
                price += lines[i + 2];
              }
              break;
            }
          }
          if (!price) {
            const pMatch = text.match(/[¥￥]\s*([\d.]+)/);
            if (pMatch) price = pMatch[1];
          }

          let location = '-';
          const locEl = a.querySelector('div[class*="seller-text--"], div[class*="seller-left--"], span[class*="seller-text--"]');
          if (locEl && locEl.innerText) location = locEl.innerText.trim();

          let seller = '-';
          const sellerEl = a.querySelector('div[class*="seller-name--"], div[class*="seller-nick--"], span[class*="seller-name--"]');
          if (sellerEl && sellerEl.innerText) seller = sellerEl.innerText.trim();

          let sellerTag = '-';
          const tagEl = a.querySelector('div[class*="credit-container--"]');
          if (tagEl && tagEl.innerText) {
            sellerTag = tagEl.innerText.trim();
          } else if (text.includes('卖家信用极好')) sellerTag = '卖家信用极好';
          else if (text.includes('卖家信用优秀')) sellerTag = '卖家信用优秀';
          else if (text.includes('百分百好评')) sellerTag = '百分百好评';

          let condition = '二手';
          if (text.includes('全新')) condition = '全新';
          else if (text.includes('几乎全新')) condition = '几乎全新';
          else if (text.includes('95新')) condition = '95新';

          let title = '';
          const titleEl = a.querySelector('div[class*="row--"], div[class*="title--"], span[class*="title--"]');
          if (titleEl && titleEl.innerText) {
            title = titleEl.innerText.trim();
          } else if (lines.length > 0) {
            title = lines.find(l => l.length > 5 && !l.startsWith('¥') && !l.startsWith('降') && !l.includes('想要')) || lines[0];
          }

          const img = a.querySelector('img');
          const imageUrl = img ? (img.src || img.getAttribute('data-src') || '') : '';

          return {
            item_id: itemId,
            title,
            price: price ? ('¥' + price) : '¥0',
            price_num: parseFloat(price) || 0,
            location,
            seller,
            seller_tag: sellerTag,
            condition,
            guarantee: text.includes('包邮') ? '包邮' : '普通',
            item_url: a.href,
            image_url: imageUrl,
            status: 'active',
          };
        });
      }, limit);

      // Filter out accessories & user-specified exclusions via contract
      const validItems = (rawCards || []).filter(it => !isAccessoryTitle(it.title, sc.category, sc.exclude, { require: sc.require }));

      // Write valid items to SQLite SSOT
      if (validItems.length > 0) {
        saveCandidates(validItems, { keyword: sc.keyword, category: sc.category, filterAccessories: true });
      }
    }

    // Map user sort parameter
    const rawSort = String(kwargs.sort || 'price_asc').trim();
    let sortKey = 'price_asc';
    if (rawSort.includes('降序') || rawSort.toLowerCase().includes('desc')) {
      sortKey = 'price_desc';
    } else if (rawSort.includes('新') || rawSort.includes('time') || rawSort.includes('updated')) {
      sortKey = 'updated';
    }

    // Unidirectional Data Flow: Re-read authoritative candidates from SQLite view
    const results = [];
    const seenItemIds = new Set();
    for (const sc of searchConfigs) {
      const candidates = queryCandidates({ 
        category: sc.category, 
        minPrice: sc.minPrice || kwargs['min-price'] || null,
        maxPrice: sc.maxPrice || kwargs['max-price'] || null,
        excludeGhosted: true, 
        sort: sortKey, 
        limit 
      });
      for (const best of candidates) {
        if (seenItemIds.has(best.item_id)) continue;
        seenItemIds.add(best.item_id);

        const trapAudit = assessLowPriceTrap({
          title: best.title,
          price: best.price,
          condition: best.condition,
          defect_notes: best.defect_notes,
          images: best.images,
          category: sc.category,
        });

        let defectDisplay = best.defect_notes || '封面完好待深检';
        if (trapAudit.isTrapRisk && !defectDisplay.includes('低价成色风险') && !defectDisplay.includes('低价陷阱')) {
          defectDisplay = `⚠️ [低价成色风险] ${defectDisplay}`;
        }
        if (defectDisplay.length > 50) {
          defectDisplay = defectDisplay.slice(0, 50) + '...';
        }

        results.push({
          category: sc.category,
          best_item_id: best.item_id,
          lowest_price: best.price,
          condition: best.condition || '-',
          defect_notes: defectDisplay,
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
