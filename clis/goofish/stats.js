import { cli, Strategy } from '@jackwener/opencli/registry';
import { safeGoto, checkAuth } from './_shared.js';

export const command = cli({
  site: 'goofish',
  name: 'stats',
  access: 'read',
  description: '查看闲鱼个人数据资产与交易履约总览看板 (在售宝贝、累计流水、待办提醒、信用评级)',
  domain: 'www.goofish.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [],
  columns: [
    'nick',
    'location',
    'published_items',
    'total_spent',
    'pending_orders',
    'unread_messages',
    'credit_rating',
  ],
  func: async (page) => {
    // 1. Get personal stats
    await safeGoto(page, 'https://www.goofish.com/personal');
    await checkAuth(page);

    const pData = await page.evaluate(() => {
      let nick = '';
      const nickEl = document.querySelector('span[class*="nick--"], div[class*="nick--"], div[class*="name--"]');
      if (nickEl) nick = nickEl.innerText.trim();

      let location = '-';
      const infoSpans = Array.from(document.querySelectorAll('div[class*="infoCenter--"] span, span[class*="infoCenterText--"]'));
      for (const s of infoSpans) {
        const t = s.innerText ? s.innerText.trim() : '';
        if (t && !t.includes('粉丝') && !t.includes('关注') && t.length <= 15 && (location === '-' || !location)) {
          location = t;
        }
      }

      let itemsCount = '0';
      const numEls = Array.from(document.querySelectorAll('div[class*="num--"]'));
      for (const el of numEls) {
        const parentText = el.parentElement ? el.parentElement.innerText : '';
        const numText = el.innerText ? el.innerText.trim() : '';
        if (/^\d+$/.test(numText) && parentText.includes('宝贝')) {
          itemsCount = numText;
          break;
        }
      }

      const text = document.body ? document.body.innerText : '';
      const creditBadges = [];
      if (text.includes('卖家信用极好')) creditBadges.push('卖家极好');
      if (text.includes('买家信用极好')) creditBadges.push('买家极好');

      return {
        nick: nick || '已登录用户',
        location: location || '-',
        published_items: itemsCount + ' 件',
        credit_rating: creditBadges.join(' · ') || '良好信用',
      };
    });

    // 2. Get orders spent and pending
    await safeGoto(page, 'https://www.goofish.com/bought');

    const orderData = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('a[href*="personal?userId="], div[class*="container--Bhfvcld8"]'));
      let spent = 0;
      let pending = 0;

      for (const card of cards) {
        const parent = card.closest('div[class*="container--"]')?.parentElement || card;
        const text = parent.innerText || '';
        const pMatch = text.match(/[¥￥]\s*([\d.]+)/);
        const price = pMatch ? parseFloat(pMatch[1]) : 0;
        if (text.includes('交易成功')) spent += price;
        if (text.includes('等待卖家发货') || text.includes('等待见面交易') || text.includes('待付款') || text.includes('退款中')) pending++;
      }

      return {
        total_spent: '¥' + spent.toFixed(2),
        pending_orders: pending > 0 ? pending + ' 笔待处理' : '无待处理',
      };
    });

    // 3. Get unread messages count
    await safeGoto(page, 'https://www.goofish.com/im');

    const unreadCount = await page.evaluate(() => {
      const badge = document.querySelector('div[class*="badge--"], span[class*="ant-badge"] sup, sup');
      return badge && badge.innerText ? badge.innerText.trim() + ' 条未读' : '无未读';
    });

    return [{
      nick: pData.nick,
      location: pData.location,
      published_items: pData.published_items,
      total_spent: orderData.total_spent,
      pending_orders: orderData.pending_orders,
      unread_messages: unreadCount,
      credit_rating: pData.credit_rating,
    }];
  },
});
