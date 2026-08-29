import { cli, Strategy } from '@jackwener/opencli/registry';
import { AuthRequiredError } from '@jackwener/opencli/errors';

export const command = cli({
  site: 'goofish',
  name: 'orders',
  access: 'read',
  description: '获取闲鱼已买到的宝贝 / 历史订单列表 (支持十余年跨页滚动拉取、关键词搜索、订单状态筛选)',
  domain: 'www.goofish.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'query', positional: true, required: false, help: '按商品标题、卖家昵称、订单号或标签搜索筛选' },
    { name: 'limit', type: 'int', default: 50, help: '返回的最大订单数量 (默认 50)' },
    { name: 'pages', type: 'int', default: 1, help: '滚动抓取轮数 (每轮约10条，设为 5 可拉取约 50 条)' },
    { name: 'all', type: 'bool', default: false, help: '是否全量滚动加载全部历史订单 (最多滚动 100 轮)' },
    { name: 'status', required: false, help: '按订单状态筛选 (全部, 待付款, 待发货, 待收货, 待评价, 退款中)' },
  ],
  columns: [
    'order_id',
    'seller',
    'seller_user_id',
    'status',
    'title',
    'price',
    'spec_tag',
    'item_id',
    'order_url',
  ],
  func: async (page, kwargs) => {
    const limit = kwargs.all ? 2000 : (kwargs.limit || 50);
    const maxScrolls = kwargs.all ? 100 : Math.max(1, Math.ceil(limit / 10));
    const query = String(kwargs.query || '').trim().toLowerCase();
    const statusFilter = String(kwargs.status || '').trim();

    await page.goto('https://www.goofish.com/bought');
    await page.wait(4);

    const isAuth = await page.evaluate(() => {
      const text = document.body ? document.body.innerText : '';
      return text.includes('我买到的') || text.includes('全部') || text.includes('我的交易') || text.includes('订单');
    });

    if (!isAuth) {
      throw new AuthRequiredError('goofish');
    }

    if (statusFilter && statusFilter !== '全部') {
      await page.evaluate((targetStatus) => {
        const tabs = Array.from(document.querySelectorAll('div, span, button')).filter(el => {
          const t = el.innerText ? el.innerText.trim() : '';
          return t === targetStatus && el.children.length === 0;
        });
        if (tabs.length > 0) {
          tabs[0].click();
        }
      }, statusFilter);
      await page.wait(3);
    }

    let prevCount = 0;
    let staleRounds = 0;

    for (let s = 0; s < maxScrolls; s++) {
      const currentCount = await page.evaluate(() => {
        return document.querySelectorAll('div[class*="container--Bhfvcld8"]').length;
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

    const rawOrders = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('div[class*="container--Bhfvcld8"]'));
      
      return cards.map((card) => {
        const sellerLink = card.querySelector('a[href*="personal?userId="]');
        const seller = sellerLink && sellerLink.innerText ? sellerLink.innerText.trim() : '';
        let sellerUserId = '';
        if (sellerLink) {
          try {
            sellerUserId = new URL(sellerLink.href, window.location.origin).searchParams.get('userId') || '';
          } catch (e) {}
        }

        const topBar = card.querySelector('div[class*="container--BwkDKCUY"]');
        let statusText = topBar && topBar.innerText ? topBar.innerText.replace(seller, '').replace(/\s+/g, ' ').trim() : '';
        if (!statusText) {
          const cardText = card.innerText || '';
          if (cardText.includes('交易成功')) statusText = '交易成功';
          else if (cardText.includes('交易关闭')) statusText = cardText.includes('有退款') ? '交易关闭(有退款)' : '交易关闭';
          else if (cardText.includes('等待卖家发货')) statusText = '等待卖家发货';
          else if (cardText.includes('待收货')) statusText = '待收货';
          else if (cardText.includes('待付款')) statusText = '待付款';
          else if (cardText.includes('退款中')) statusText = '退款中';
          else if (cardText.includes('待评价')) statusText = '待评价';
          else statusText = '交易完成';
        }

        const itemLink = card.querySelector('a[href*="order-detail?orderId="]') || card.querySelector('a.info--vYR7LJEk');
        const orderUrl = (itemLink && itemLink.href && !itemLink.href.startsWith('javascript:')) ? itemLink.href : '';
        let orderId = '';
        if (orderUrl) {
          try {
            orderId = new URL(orderUrl, window.location.origin).searchParams.get('orderId') || '';
          } catch (e) {}
        }

        const titleEl = card.querySelector('div[class*="name--DMayvjw5"]') || card.querySelector('div[class*="desc--UwIZUPPe"]');
        let title = titleEl && titleEl.innerText ? titleEl.innerText.trim() : '';
        if (!title) {
          const lines = (card.innerText || '').split('\n').map(s => s.trim()).filter(Boolean);
          const titleCand = lines.find(l => l !== seller && !l.includes('交易') && !l.includes('发货') && !l.startsWith('¥') && !l.startsWith('￥') && !['更多', '联系卖家', '再次购买', '去评价', '查看评价', '查看钱款', '提醒发货'].includes(l));
          title = titleCand || '';
        }

        const priceEl = card.querySelector('div[class*="price--GDPxbdMU"]') || card.querySelector('div[class*="price--"]');
        let price = priceEl && priceEl.innerText ? priceEl.innerText.replace(/\s+/g, '') : '';
        if (!price) {
          const pMatch = (card.innerText || '').match(/[¥￥]\s*([\d.]+)/);
          if (pMatch) price = '¥' + pMatch[1];
        }

        const tagEl = card.querySelector('div[class*="tags--UTjYd9Jr"]') || card.querySelector('div[class*="tags--"]');
        let specTag = tagEl && tagEl.innerText ? tagEl.innerText.replace(/\n+/g, ' | ').trim() : '';

        const imLink = card.querySelector('a[href*="/im?"]') || card.querySelector('a[href*="itemId="]');
        let itemId = '';
        if (imLink) {
          try {
            itemId = new URL(imLink.href, window.location.origin).searchParams.get('itemId') || '';
          } catch (e) {}
        }

        if (!orderId && itemId) {
          orderId = 'XY_' + itemId;
        }

        return {
          order_id: orderId || '-',
          seller: seller || '未知卖家',
          seller_user_id: sellerUserId || '-',
          status: statusText || '交易成功',
          title: title.slice(0, 120),
          price: price || '¥0',
          spec_tag: specTag || '-',
          item_id: itemId || '-',
          order_url: orderUrl || '-',
        };
      });
    });

    const seen = new Set();
    let deduplicated = [];
    for (const ord of (rawOrders || [])) {
      const key = ord.order_id + '_' + ord.title + '_' + ord.price;
      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push(ord);
      }
    }

    if (query) {
      deduplicated = deduplicated.filter(o =>
        o.title.toLowerCase().includes(query) ||
        o.seller.toLowerCase().includes(query) ||
        o.order_id.includes(query) ||
        o.spec_tag.toLowerCase().includes(query) ||
        o.item_id.includes(query)
      );
    }

    if (statusFilter && statusFilter !== '全部') {
      deduplicated = deduplicated.filter(o => o.status.includes(statusFilter));
    }

    return deduplicated.slice(0, limit);
  },
});
