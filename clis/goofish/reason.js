import { cli, Strategy } from '@jackwener/opencli/registry';
import { AuthRequiredError } from '@jackwener/opencli/errors';

export const command = cli({
  site: 'goofish',
  name: 'reason',
  access: 'read',
  description: '对闲鱼历史订单进行智能消费与履约分析 (累计花费、高频卖家、待发货预警、消费特征画像)',
  domain: 'www.goofish.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'query', positional: true, required: false, help: '按关键词筛选特定品类的消费分析' },
    { name: 'limit', type: 'int', default: 50, help: '分析样本订单数量 (默认 50)' },
  ],
  columns: [
    'total_orders_analyzed',
    'total_spent',
    'top_sellers',
    'pending_alerts',
    'consumption_summary',
  ],
  func: async (page, kwargs) => {
    const limit = Math.max(10, Math.min(Number(kwargs.limit) || 50, 500));
    const query = String(kwargs.query || '').trim().toLowerCase();

    await page.goto('https://www.goofish.com/bought');
    await page.wait(4);

    const isAuth = await page.evaluate(() => {
      const text = document.body ? document.body.innerText : '';
      return text.includes('我买到的') || text.includes('全部') || text.includes('我的交易');
    });

    if (!isAuth) {
      throw new AuthRequiredError('goofish');
    }

    const scrollCycles = Math.ceil(limit / 10);
    for (let s = 0; s < scrollCycles; s++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.wait(1.2);
    }

    const rawOrders = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('div[class*="container--Bhfvcld8"]'));
      
      return cards.map((card) => {
        const sellerLink = card.querySelector('a[href*="personal?userId="]');
        const seller = sellerLink && sellerLink.innerText ? sellerLink.innerText.trim() : '未知卖家';

        const topBar = card.querySelector('div[class*="container--BwkDKCUY"]');
        let statusText = topBar && topBar.innerText ? topBar.innerText.replace(seller, '').replace(/\s+/g, ' ').trim() : '';
        if (!statusText) {
          const cardText = card.innerText || '';
          if (cardText.includes('交易成功')) statusText = '交易成功';
          else if (cardText.includes('交易关闭')) statusText = '交易关闭';
          else if (cardText.includes('等待卖家发货')) statusText = '等待卖家发货';
          else statusText = '交易完成';
        }

        const titleEl = card.querySelector('div[class*="name--DMayvjw5"]') || card.querySelector('div[class*="desc--UwIZUPPe"]');
        let title = titleEl && titleEl.innerText ? titleEl.innerText.trim() : '';

        const priceEl = card.querySelector('div[class*="price--GDPxbdMU"]') || card.querySelector('div[class*="price--"]');
        let price = priceEl && priceEl.innerText ? priceEl.innerText.replace(/\s+/g, '') : '';
        if (!price) {
          const pMatch = (card.innerText || '').match(/[¥￥]\s*([\d.]+)/);
          if (pMatch) price = '¥' + pMatch[1];
        }

        return { seller, title, price, status: statusText };
      });
    });

    let orders = rawOrders || [];
    if (query) {
      orders = orders.filter(o => o.title.toLowerCase().includes(query) || o.seller.toLowerCase().includes(query));
    }

    let totalSpent = 0;
    const sellerCounts = {};
    const pendingOrders = [];
    const categories = [];

    for (const ord of orders) {
      const numericPrice = parseFloat(ord.price.replace(/[¥￥]/g, '')) || 0;
      if (ord.status.includes('交易成功') || ord.status.includes('等待卖家发货')) {
        totalSpent += numericPrice;
      }

      sellerCounts[ord.seller] = (sellerCounts[ord.seller] || 0) + 1;

      if (ord.status.includes('等待卖家发货') || ord.status.includes('待付款') || ord.status.includes('退款中')) {
        pendingOrders.push('[' + ord.status + '] ' + ord.seller + ' - ' + ord.title + ' (' + ord.price + ')');
      }

      if (/音乐|课程|声乐|指弹|吉他|编曲/.test(ord.title)) categories.push('音乐/教育');
      else if (/suno|ai|提示词|工作流|工具|会员/.test(ord.title.toLowerCase())) categories.push('AI/数字工具');
      else if (/sheerid|edu|认证/.test(ord.title.toLowerCase())) categories.push('权益认证');
      else if (/相机|手机|耳放|耳机|硬盘|数码|固态/.test(ord.title)) categories.push('数码硬件');
      else categories.push('生活二手');
    }

    const topSellers = Object.entries(sellerCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([s, c]) => s + ' (' + c + '次)')
      .join(' · ');

    const catFreq = {};
    for (const c of categories) catFreq[c] = (catFreq[c] || 0) + 1;
    const sortedCats = Object.entries(catFreq).sort((a, b) => b[1] - a[1]);
    const topCatName = sortedCats[0] ? sortedCats[0][0] + ' (' + Math.round((sortedCats[0][1] / Math.max(1, orders.length)) * 100) + '%)' : '多元消费';

    const summary = '样本 ' + orders.length + ' 笔订单，主力品类为【' + topCatName + '】。已成功结算流水约 ¥' + totalSpent.toFixed(2) + '。' + (pendingOrders.length > 0 ? '当前有 ' + pendingOrders.length + ' 笔订单需关注履约状态。' : '全部订单履约完结。');

    return [{
      total_orders_analyzed: orders.length,
      total_spent: '¥' + totalSpent.toFixed(2),
      top_sellers: topSellers || '无重复卖家',
      pending_alerts: pendingOrders.length > 0 ? pendingOrders.join('\n') : '暂无待履约订单',
      consumption_summary: summary,
    }];
  },
});
