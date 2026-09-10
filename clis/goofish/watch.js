import { cli, Strategy } from '@jackwener/opencli/registry';
import { safeGoto } from './_shared.js';
import { 
  saveCandidates, 
  queryCandidates, 
  subscribeLiveQuery 
} from './_db.js';
import { 
  isAccessoryTitle, 
  inferCategory 
} from './_contract.js';

export const command = cli({
  site: 'goofish',
  name: 'watch',
  access: 'read',
  description: '实时监听全网新上架宝贝与降价提醒 (推送式实时订阅，毫秒级响应写入本地真理库并输出动态)',
  domain: 'www.goofish.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'query', positional: true, required: false, help: '监听关键词 (如 nexg 2n 或 lava me air)' },
    { name: 'category', type: 'str', help: '归一化品类 (如 nexg2_nylon / lava_me_air / lava_me_4)' },
    { name: 'min-price', type: 'str', help: '最低价格过滤' },
    { name: 'max-price', type: 'str', help: '最高价格过滤' },
    { name: 'interval', type: 'int', default: 10, help: '监听轮询间隔秒数 (默认 10)' },
    { name: 'iterations', type: 'int', default: 1, help: '最大执行轮次 (默认 1，传入如 5 进行多次监听)' },
  ],
  columns: [
    'timestamp',
    'event_type',
    'item_id',
    'price',
    'seller',
    'seller_status',
    'title',
    'item_url',
  ],
  func: async (page, kwargs) => {
    const query = String(kwargs.query || kwargs._?.[0] || 'nexg 2n').trim();
    const category = kwargs.category ? String(kwargs.category).trim() : inferCategory({ keyword: query });
    const isGuitarTarget = ['nexg2_nylon', 'lava_me_air', 'lava_me_4'].includes(category);
    const minPrice = kwargs['min-price'] || (isGuitarTarget ? '700' : null);
    const maxPrice = kwargs['max-price'] || null;
    const intervalSec = Math.max(2, Number(kwargs.interval) || 10);
    const maxIterations = Math.max(1, Math.min(Number(kwargs.iterations) || 1, 100));

    const eventsLog = [];
    const seenPrices = new Map();

    // 1. Initialize seen items from local SQLite SSOT
    const localItems = queryCandidates({ category, keyword: query, minPrice, maxPrice });
    for (const it of localItems) {
      seenPrices.set(it.item_id, it.price_num);
    }

    // 2. Set up push-style reactive live query subscription
    const sub = subscribeLiveQuery({
      tables: ['candidates', 'seller_reviews'],
      queryFn: () => queryCandidates({ category, keyword: query, minPrice, maxPrice }),
      onChange: (freshCandidates, mutationEvt) => {
        if (mutationEvt?.initial) return;
        const nowStr = new Date().toLocaleTimeString('zh-CN', { hour12: false });
        for (const it of freshCandidates) {
          const oldPrice = seenPrices.get(it.item_id);
          if (oldPrice === undefined) {
            eventsLog.push({
              timestamp: nowStr,
              event_type: '🆕 新上架',
              item_id: it.item_id,
              price: it.price,
              seller: it.seller,
              seller_status: it.seller_status === 'responsive' 
                ? '✅ 活跃报价' 
                : (it.seller_status === 'ghosted' ? '⚠️ 曾已读不回' : (it.seller_status === 'unfit' ? '❌ 明确无货' : '❓ 待沟通')),
              title: it.title,
              item_url: it.item_url,
            });
            seenPrices.set(it.item_id, it.price_num);
          } else if (it.price_num < oldPrice) {
            eventsLog.push({
              timestamp: nowStr,
              event_type: `📉 降价 (¥${oldPrice} -> ${it.price})`,
              item_id: it.item_id,
              price: it.price,
              seller: it.seller,
              seller_status: it.seller_status === 'responsive' 
                ? '✅ 活跃报价' 
                : (it.seller_status === 'ghosted' ? '⚠️ 曾已读不回' : (it.seller_status === 'unfit' ? '❌ 明确无货' : '❓ 待沟通')),
              title: it.title,
              item_url: it.item_url,
            });
            seenPrices.set(it.item_id, it.price_num);
          }
        }
      },
    });

    try {
      const searchUrl = 'https://www.goofish.com/search?q=' + encodeURIComponent(query);

      for (let iter = 0; iter < maxIterations; iter++) {
        await safeGoto(page, searchUrl);

        // Extract items from page
        const items = await page.evaluate(() => {
          const itemLinks = Array.from(document.querySelectorAll('a[href*="item?id="]')).slice(0, 20);
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

            let seller = '-';
            const sellerEl = a.querySelector('div[class*="seller-name--"], div[class*="seller-nick--"], span[class*="seller-name--"]');
            if (sellerEl && sellerEl.innerText) seller = sellerEl.innerText.trim();

            let location = '-';
            const locEl = a.querySelector('div[class*="seller-text--"], div[class*="seller-left--"], span[class*="seller-text--"]');
            if (locEl && locEl.innerText) location = locEl.innerText.trim();

            let title = '';
            const titleEl = a.querySelector('div[class*="row--"], div[class*="title--"], span[class*="title--"]');
            if (titleEl && titleEl.innerText) {
              title = titleEl.innerText.trim();
            } else if (lines.length > 0) {
              title = lines.find(l => l.length > 5 && !l.startsWith('¥')) || lines[0];
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
        });

        if (Array.isArray(items) && items.length > 0) {
          const validGuitars = items.filter(it => !isAccessoryTitle(it.title, category));
          if (validGuitars.length > 0) {
            // Unidirectional write: save to SQLite DB
            // This triggers dbEmitter -> live query push update
            saveCandidates(validGuitars, { keyword: query, category, filterAccessories: true });
          }
        }

        if (iter < maxIterations - 1) {
          await page.wait(intervalSec);
        }
      }
    } finally {
      sub.unsubscribe();
    }

    if (eventsLog.length === 0) {
      // If no new alert occurred in single run, show latest authoritative items as snapshot
      const current = queryCandidates({ category, keyword: query, minPrice, maxPrice, limit: 10 });
      return current.map(c => ({
        timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
        event_type: '🔍 实时对齐',
        item_id: c.item_id,
        price: c.price,
        seller: c.seller,
        seller_status: c.seller_status === 'responsive' 
          ? '✅ 活跃报价' 
          : (c.seller_status === 'ghosted' ? '⚠️ 曾已读不回' : (c.seller_status === 'unfit' ? '❌ 明确无货' : '❓ 待沟通')),
        title: c.title,
        item_url: c.item_url,
      }));
    }

    return eventsLog;
  },
});
