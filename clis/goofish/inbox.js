import { cli, Strategy } from '@jackwener/opencli/registry';
import { safeGoto, checkAuth } from './_shared.js';
import { saveSessions } from './_db.js';

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

    await safeGoto(page, 'https://www.goofish.com/im');
    await checkAuth(page);

    // Wait for conversation items to render
    // Wait for conversation items AND contact names (skeleton disappeared) to render
    for (let retry = 0; retry < 8; retry++) {
      const isReady = await page.evaluate(() => {
        const items = document.querySelectorAll('div[class*="conversation-item--"]');
        if (items.length === 0) return false;
        const first = items[0];
        const nameEl = first.querySelector('div[style*="font-size: 14px"]');
        const hasName = nameEl && nameEl.innerText && nameEl.innerText.trim().length > 0;
        const hasSkeleton = Boolean(first.querySelector('.ant-skeleton:not([style*="display: none"])'));
        return (hasName || (first.innerText || '').split('\n').length >= 3) && !hasSkeleton;
      });
      if (isReady) break;
      await page.wait(1.5);
    }

    // Reset virtual list position
    await page.evaluate(() => {
      const holder = document.querySelector('.rc-virtual-list-holder');
      if (holder) {
        holder.scrollTop = 0;
        holder.dispatchEvent(new Event('scroll', { bubbles: true }));
      }
    });
    await page.wait(1);

    const collectedMap = new Map();

    for (let s = 0; s < maxScrolls; s++) {
      const batch = await page.evaluate(() => {
        const holder = document.querySelector('.rc-virtual-list-holder');
        const items = Array.from(document.querySelectorAll('div[class*="conversation-item--"]'));
        
        const extracted = items.map(it => {
          const text = it.innerText || '';
          const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
          
          let tradeStatus = '-';
          let lastMsg = '-';
          let timeStr = '-';
          let unreadCount = '0';

          const unreadEl = it.querySelector('div[class*="badge--"], span[class*="badge--"], sup');
          if (unreadEl && unreadEl.innerText) {
            unreadCount = unreadEl.innerText.trim();
          }

          for (const l of lines) {
            if (['等待卖家发货', '等待买家付款', '等待买家发货', '待收货', '有新交易评价', '交易关闭', '交易成功', '退款中', '等待见面交易'].includes(l)) {
              tradeStatus = l;
            } else if (l.includes('小时前') || l.includes('分钟前') || l.includes('刚刚') || l.includes('昨天') || /^\d{2}-\d{2}$/.test(l)) {
              timeStr = l;
            }
          }

          // 1. Precise DOM element targeting based on Goofish Web IM layout
          const nameEl = it.querySelector('div[style*="font-weight: 500"][style*="font-size: 14px"] > div, div[style*="font-weight: 500"][style*="font-size: 14px"], div[style*="font-size: 14px"], div[class*="title--"], span[class*="title--"]');
          let domName = nameEl ? (nameEl.innerText || '').trim() : '';
          if (domName && domName.includes('\n')) {
            domName = domName.split('\n')[0].trim();
          }

          const msgEl = it.querySelector('div[style*="font-size: 12px"], div[class*="message--"]');
          let domMsg = msgEl ? (msgEl.innerText || '').trim() : '';

          const timeEl = it.querySelector('div[style*="font-size: 10px"], div[class*="time--"]');
          let domTime = timeEl ? (timeEl.innerText || '').trim() : '';
          if (domTime) timeStr = domTime;

          // 2. Resilient fallback to cleaned text lines
          const cleanLines = lines.filter(l => 
            l !== unreadCount && 
            !/^\d{1,4}$/.test(l) && 
            l !== timeStr && 
            l !== tradeStatus && 
            !l.startsWith('¥') && 
            !l.startsWith('￥')
          );

          let name = domName;
          if (!name || /^\d{1,4}$/.test(name) || name === timeStr || name === tradeStatus) {
            name = cleanLines[0] || '未知联系人';
          }
          if (name === timeStr || name === tradeStatus || /^\d{1,4}$/.test(name)) {
            name = cleanLines.find(l => !/^\d{1,4}$/.test(l) && l !== timeStr && l !== tradeStatus) || '未知联系人';
          }

          if (domMsg && domMsg !== name && domMsg !== tradeStatus) {
            lastMsg = domMsg;
          } else {
            const msgCand = cleanLines.find(l => 
              l !== name && 
              l !== timeStr && 
              l !== tradeStatus && 
              !['交易成功', '交易关闭', '退款成功', '有新交易评价', '等待见面交易'].includes(l)
            );
            if (msgCand) lastMsg = msgCand;
          }

          const hasItemImg = Boolean(
            it.querySelector('img[src*="xy_item"]') || 
            it.querySelector('div[style*="50px"] img') ||
            (it.querySelectorAll('img').length >= 2)
          );

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
          holder.scrollTop += 350;
          holder.dispatchEvent(new Event('scroll', { bubbles: true }));
        }

        return extracted;
      });

      for (const item of (batch || [])) {
        if (item.name && item.name !== '未知联系人' && !collectedMap.has(item.name + '_' + item.last_message)) {
          collectedMap.set(item.name + '_' + item.last_message, item);
        }
      }

      if (collectedMap.size >= limit) break;
      await page.wait(1.5);
    }

    let contacts = Array.from(collectedMap.values());

    // Unidirectional write-back into SQLite SSOT
    if (contacts.length > 0) {
      try {
        saveSessions(contacts.map(c => ({
          contact_name: c.name,
          trade_status: c.trade_status,
          last_message: c.last_message,
          time: c.time,
          unread: c.unread,
          has_item: c.has_item,
        })));
      } catch (e) {}
    }

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
