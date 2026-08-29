import { cli, Strategy } from '@jackwener/opencli/registry';
import { AuthRequiredError } from '@jackwener/opencli/errors';

export const command = cli({
  site: 'goofish',
  name: 'inbox',
  access: 'read',
  description: '获取闲鱼私信会话与联系人列表 (支持向下虚拟滚动加载更多联系人、交易状态筛选、未读筛选)',
  domain: 'www.goofish.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'query', positional: true, required: false, help: '按联系人昵称或最后消息关键词搜索' },
    { name: 'limit', type: 'int', default: 30, help: '返回的最大联系人数量 (默认 30)' },
    { name: 'scrolls', type: 'int', default: 6, help: '向下滚动加载联系人的轮数 (默认 6)' },
    { name: 'all', type: 'bool', default: false, help: '是否全量滚动加载所有联系人 (最多滚动 50 轮)' },
    { name: 'unread-only', type: 'bool', default: false, help: '只显示有未读消息的会话' },
  ],
  columns: [
    'index',
    'contact_name',
    'trade_status',
    'last_message',
    'time',
    'unread',
    'has_item',
  ],
  func: async (page, kwargs) => {
    const limit = kwargs.all ? 500 : (Number(kwargs.limit) || 30);
    const maxScrolls = kwargs.all ? 50 : Math.max(1, Number(kwargs.scrolls) || 6);
    const query = String(kwargs.query || '').trim().toLowerCase();
    const unreadOnly = Boolean(kwargs['unread-only']);

    await page.goto('https://www.goofish.com/im');
    await page.wait(4);

    const isAuth = await page.evaluate(() => {
      const text = document.body ? document.body.innerText : '';
      return text.includes('消息') || text.includes('通知消息') || text.includes('聊天') || text.includes('Vector_Y');
    });

    if (!isAuth) {
      throw new AuthRequiredError('goofish');
    }

    // Wait for conversation items to render
    for (let retry = 0; retry < 5; retry++) {
      const hasItems = await page.evaluate(() => document.querySelectorAll('div[class*="conversation-item--"]').length > 0);
      if (hasItems) break;
      await page.wait(1.5);
    }

    const collectedMap = new Map();

    for (let s = 0; s < maxScrolls; s++) {
      const batch = await page.evaluate(() => {
        const holder = document.querySelector('.rc-virtual-list-holder');
        const items = Array.from(document.querySelectorAll('div[class*="conversation-item--"]'));
        
        const extracted = items.map(it => {
          const text = it.innerText || '';
          const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
          
          let name = lines[0] || '未知联系人';
          let tradeStatus = '-';
          let lastMsg = '-';
          let timeStr = '-';
          let unreadCount = '0';

          const unreadEl = it.querySelector('div[class*="badge--"], span[class*="badge--"], sup');
          if (unreadEl && unreadEl.innerText) {
            unreadCount = unreadEl.innerText.trim();
          }

          for (const l of lines) {
            if (['等待卖家发货', '等待买家付款', '等待买家发货', '待收货', '有新交易评价', '交易关闭', '交易成功', '退款中'].includes(l)) {
              tradeStatus = l;
            } else if (l.includes('小时前') || l.includes('分钟前') || l.includes('刚刚') || l.includes('昨天') || l.match(/^\d{2}-\d{2}$/)) {
              timeStr = l;
            }
          }

          const msgCand = lines.find(l => l !== name && l !== tradeStatus && l !== timeStr && l !== unreadCount && !l.includes('评价') && !l.startsWith('¥'));
          if (msgCand) lastMsg = msgCand;

          const hasItemImg = Boolean(it.querySelector('img[src*="alicdn"], img[src*="tbcdn"]'));

          return {
            name,
            trade_status: tradeStatus,
            last_message: lastMsg,
            time: timeStr,
            unread: unreadCount !== '0' ? unreadCount : '-',
            has_item: hasItemImg ? '是' : '-',
          };
        });

        if (holder) {
          holder.scrollTop += 500;
        }

        return extracted;
      });

      for (const item of (batch || [])) {
        if (item.name && item.name !== '未知联系人' && !collectedMap.has(item.name)) {
          collectedMap.set(item.name, item);
        }
      }

      if (collectedMap.size >= limit) break;
      await page.wait(1.5);
    }

    let contacts = Array.from(collectedMap.values());

    if (query) {
      contacts = contacts.filter(c => c.name.toLowerCase().includes(query) || c.last_message.toLowerCase().includes(query) || c.trade_status.includes(query));
    }

    if (unreadOnly) {
      contacts = contacts.filter(c => c.unread !== '-');
    }

    return contacts.slice(0, limit).map((c, idx) => ({
      index: idx + 1,
      contact_name: c.name,
      trade_status: c.trade_status,
      last_message: c.last_message,
      time: c.time,
      unread: c.unread,
      has_item: c.has_item,
    }));
  },
});
