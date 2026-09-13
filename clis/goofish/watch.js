import { cli, Strategy } from '@jackwener/opencli/registry';
import { spawnSync } from 'child_process';
import { safeGoto, humanDelay } from './_shared.js';
import { 
  saveCandidates, 
  queryCandidates, 
  subscribeLiveQuery 
} from './_db.js';
import { 
  isAccessoryTitle, 
  inferCategory,
  validateCandidate
} from './_contract.js';

export {
  sendWebhookNotification,
  sendDesktopNotification,
  extractMultiImageDefects
} from './_contract.js';

export const command = cli({
  site: 'goofish',
  name: 'watch',
  access: 'read',
  description: '周期性/实时监控全网新上架宝贝与降价提醒 (支持 NEXG 2N 尼龙版全自动筛选、多图质检、Webhook与桌面告警)',
  domain: 'www.goofish.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'query', positional: true, required: false, help: '监听关键词 (如 nexg 2n 尼龙 或 绿联 15375)' },
    { name: 'category', type: 'str', help: '归一化品类 (如 nexg2_nylon / ugreen_hub / lava_me_air)' },
    { name: 'min-price', type: 'str', help: '最低价格过滤' },
    { name: 'max-price', type: 'str', help: '最高价格过滤 (高于此价格不上报)' },
    { name: 'exclude', type: 'str', help: '自定义排除词，以逗号分隔 (如 踏板,琴包,配件,钢弦)' },
    { name: 'interval', type: 'int', default: 15, help: '监听轮询间隔秒数 (默认 15，内置高斯随机抖动)' },
    { name: 'iterations', type: 'int', default: 1, help: '最大执行轮次 (默认 1 用于 Cadence 定时任务，传入如 10 进行多次轮询)' },
    { name: 'daemon', type: 'bool', default: false, help: '是否作为常驻守护进程持续轮询' },
    { name: 'webhook', type: 'str', help: 'Webhook 接收端 URL (如 http://127.0.0.1:9423/webhook/goofish)' },
    { name: 'notify', type: 'bool', default: false, help: '触发 macOS 桌面横幅系统通知' },
    { name: 'diff-only', type: 'bool', default: false, help: '仅在产生新上架或降价事件时输出结果 (稳态静默)' },
    { name: 'inspect-images', type: 'bool', default: false, help: '对新上架候选执行多图深度客观瑕疵质检' },
  ],
  columns: [
    'timestamp',
    'event_type',
    'item_id',
    'price',
    'condition',
    'defect_notes',
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
    const maxPriceNum = maxPrice ? parseFloat(String(maxPrice).replace(/[^\d.]/g, '')) : null;
    const customExclude = kwargs.exclude ? String(kwargs.exclude).split(',').map(s => s.trim()).filter(Boolean) : [];
    const intervalSec = Math.max(5, Number(kwargs.interval) || 15);
    const isDaemon = Boolean(kwargs.daemon);
    const maxIterations = isDaemon ? 999999 : Math.max(1, Math.min(Number(kwargs.iterations) || 1, 100));
    const webhookUrl = kwargs.webhook ? String(kwargs.webhook).trim() : null;
    const enableNotify = Boolean(kwargs.notify);
    const diffOnly = Boolean(kwargs['diff-only']);
    const inspectImages = Boolean(kwargs['inspect-images']);

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
      onChange: async (freshCandidates, mutationEvt) => {
        if (mutationEvt?.initial) return;
        const nowStr = new Date().toLocaleTimeString('zh-CN', { hour12: false });
        for (const it of freshCandidates) {
          if (maxPriceNum && it.price_num > maxPriceNum) continue;

          const oldPrice = seenPrices.get(it.item_id);
          let eventType = null;
          let priceDropText = null;

          if (oldPrice === undefined) {
            eventType = '🆕 新上架';
            seenPrices.set(it.item_id, it.price_num);
          } else if (it.price_num < oldPrice) {
            priceDropText = `¥${oldPrice - it.price_num}`;
            eventType = `📉 降价 (¥${oldPrice} -> ${it.price})`;
            seenPrices.set(it.item_id, it.price_num);
          }

          if (eventType) {
            const row = {
              timestamp: nowStr,
              event_type: eventType,
              item_id: it.item_id,
              price: it.price,
              condition: it.condition || '95新',
              defect_notes: it.defect_notes || '待多图深检',
              seller: it.seller,
              seller_status: it.seller_status === 'responsive' 
                ? '✅ 活跃报价' 
                : (it.seller_status === 'ghosted' ? '⚠️ 曾已读不回' : (it.seller_status === 'unfit' ? '❌ 明确无货' : '❓ 待沟通')),
              title: it.title,
              item_url: it.item_url,
            };

            eventsLog.push(row);

            // Dispatch external notifications
            if (webhookUrl) {
              const payload = {
                source: 'goofish-watch',
                event: 'candidate_alert',
                action: 'notify',
                timestamp: new Date().toISOString(),
                data: {
                  event_type: eventType.includes('新上架') ? 'new_arrival' : 'price_drop',
                  item_id: it.item_id,
                  category,
                  title: it.title,
                  price: it.price,
                  old_price: oldPrice ? `¥${oldPrice}` : null,
                  price_drop: priceDropText,
                  condition: it.condition,
                  defect_notes: it.defect_notes,
                  seller: it.seller,
                  seller_status: it.seller_status,
                  item_url: it.item_url,
                },
              };
              await sendWebhookNotification(webhookUrl, payload);
            }

            if (enableNotify) {
              sendDesktopNotification(
                `闲鱼捡漏 [${eventType}]: ${it.price}`,
                `${it.title.slice(0, 30)} (卖家: ${it.seller})`
              );
            }
          }
        }
      },
    });

    try {
      const searchUrl = 'https://www.goofish.com/search?q=' + encodeURIComponent(query);

      for (let iter = 0; iter < maxIterations; iter++) {
        await safeGoto(page, searchUrl);

        // Anti-bot risk check
        const currentUrl = page.url ? page.url() : '';
        if (currentUrl.includes('sec.taobao.com') || currentUrl.includes('login.m.taobao.com')) {
          eventsLog.push({
            timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
            event_type: '⚠️ 安全风控拦截',
            item_id: '-',
            price: '-',
            condition: '-',
            defect_notes: '检测到阿里滑动验证码或登录重定向，已触发安全冷却',
            seller: '-',
            seller_status: '❌ 暂停等待',
            title: '阿里安全风控拦截',
            item_url: currentUrl,
          });
          break;
        }

        // Extract items from page
        const items = await page.evaluate(() => {
          const itemLinks = Array.from(document.querySelectorAll('a[href*="item?id="]')).slice(0, 25);
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

            // Image collection
            const imgEls = Array.from(a.querySelectorAll('img[src*="alicdn.com"]'));
            const images = imgEls.map(img => img.src).filter(Boolean);

            return {
              item_id: itemId,
              title,
              price: price || '¥0',
              location,
              seller,
              item_url: a.href,
              image_url: images[0] || '',
              images: images.join('|'),
            };
          });
        });

        if (Array.isArray(items) && items.length > 0) {
          const validCandidates = items.filter(it => !isAccessoryTitle(it.title, category, customExclude));
          if (validCandidates.length > 0) {
            // Optional deep inspection on newly arrived candidates
            if (inspectImages) {
              for (const cand of validCandidates) {
                if (!seenPrices.has(cand.item_id)) {
                  const defect = extractMultiImageDefects(cand.title, cand.images);
                  cand.defect_notes = defect.defect_notes;
                  cand.condition = defect.condition;
                }
              }
            }
            // Unidirectional write: save to SQLite DB
            // This triggers dbEmitter -> live query push update
            saveCandidates(validCandidates, { keyword: query, category, filterAccessories: true });
          }
        }

        if (iter < maxIterations - 1) {
          // Add randomized Gaussian jitter: 80% to 120% of interval
          const jitterMs = intervalSec * 1000 * (0.8 + Math.random() * 0.4);
          await new Promise(r => setTimeout(r, jitterMs));
        }
      }
    } finally {
      sub.unsubscribe();
    }

    if (eventsLog.length === 0) {
      if (diffOnly) {
        return [];
      }
      // If no new alert occurred in single run and not diff-only, show latest authoritative items as snapshot
      const current = queryCandidates({ category, keyword: query, minPrice, maxPrice, limit: 10 });
      return current.map(c => ({
        timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
        event_type: '🔍 实时对齐',
        item_id: c.item_id,
        price: c.price,
        condition: c.condition || '95新',
        defect_notes: c.defect_notes || '封面完好待深检',
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
