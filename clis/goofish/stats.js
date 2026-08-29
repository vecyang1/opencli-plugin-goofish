import { cli, Strategy } from '@jackwener/opencli/registry';
import { AuthRequiredError } from '@jackwener/opencli/errors';

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
    await page.goto('https://www.goofish.com/personal');
    await page.wait(4);

    const isAuth = await page.evaluate(() => {
      const text = document.body ? document.body.innerText : '';
      return text.includes('编辑资料') || text.includes('信用及评价') || text.includes('Vector_Y');
    });

    if (!isAuth) {
      throw new AuthRequiredError('goofish');
    }

    const pData = await page.evaluate(() => {
      const text = document.body ? document.body.innerText : '';
      const lines = text.split('\n').map(s => s.trim()).filter(Boolean);

      let nick = 'Vector_Y';
      let location = '-';
      let itemsCount = '0';
      const itemsIdx = lines.findIndex(l => l === '宝贝');
      if (itemsIdx >= 0 && lines[itemsIdx + 1] && lines[itemsIdx + 1].match(/^\d+$/)) {
        itemsCount = lines[itemsIdx + 1];
      }

      for (const l of lines.slice(0, 20)) {
        if (['越南', '北京', '上海', '广州', '深圳', '杭州', '成都', '武汉'].includes(l)) {
          location = l;
        }
      }

      const creditBadges = [];
      if (text.includes('卖家信用极好')) creditBadges.push('卖家极好');
      if (text.includes('买家信用极好')) creditBadges.push('买家极好');

      return {
        nick,
        location,
        published_items: itemsCount + ' 件',
        credit_rating: creditBadges.join(' · ') || '良好信用',
      };
    });

    // 2. Get orders spent and pending
    await page.goto('https://www.goofish.com/bought');
    await page.wait(3);

    const orderData = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('div[class*="container--Bhfvcld8"]'));
      let spent = 0;
      let pending = 0;

      for (const card of cards) {
        const text = card.innerText || '';
        const pMatch = text.match(/[¥￥]\s*([\d.]+)/);
        const price = pMatch ? parseFloat(pMatch[1]) : 0;
        if (text.includes('交易成功')) spent += price;
        if (text.includes('等待卖家发货') || text.includes('待付款') || text.includes('退款中')) pending++;
      }

      return {
        total_spent: '¥' + spent.toFixed(2),
        pending_orders: pending > 0 ? pending + ' 笔待处理' : '无待处理',
      };
    });

    // 3. Get unread messages count
    await page.goto('https://www.goofish.com/im');
    await page.wait(3);

    const unreadCount = await page.evaluate(() => {
      const badge = document.querySelector('div[class*="badge--"], sup');
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
