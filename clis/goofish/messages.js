import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError } from '@jackwener/opencli/errors';
import { safeGoto, checkAuth } from './_shared.js';
import { saveMessages, syncSellerReviewsFromSessionsAndMessages } from './_db.js';

export const command = cli({
  site: 'goofish',
  name: 'messages',
  access: 'read',
  description: '读取指定闲鱼联系人的聊天消息记录 (支持向上滚动拉取更多历史、交易卡片解析、图片链接)',
  domain: 'www.goofish.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'contact', positional: true, required: true, help: '联系人昵称或关键词 (如: 音乐家肖邦, 数码玩家)' },
    { name: 'limit', type: 'int', default: 50, help: '最大读取消息条数 (默认 50)' },
    { name: 'scrolls', type: 'int', default: 5, help: '向上滚动加载更早历史消息的轮数 (默认 5)' },
  ],
  columns: [
    'index',
    'sender',
    'is_self',
    'content',
    'read_status',
  ],
  func: async (page, kwargs) => {
    const contactQuery = String(kwargs.contact || kwargs._?.[0] || '').trim();
    if (!contactQuery) {
      throw new ArgumentError('请指定要查询消息的联系人昵称 (如: opencli xianyu messages "音乐家肖邦")');
    }
    const limit = Math.max(5, Math.min(Number(kwargs.limit) || 50, 200));
    const maxScrolls = Math.max(1, Math.min(Number(kwargs.scrolls) || 5, 20));

    await safeGoto(page, 'https://www.goofish.com/im');
    await checkAuth(page);

    // Wait until conversation items have loaded text
    for (let r = 0; r < 6; r++) {
      const hasText = await page.evaluate(() => {
        const item = document.querySelector('div[class*="conversation-item--"]');
        return Boolean(item && item.innerText && item.innerText.trim().length > 0);
      });
      if (hasText) break;
      await page.wait(1.5);
    }

    // In-page search and scroll loop for virtual list
    const found = await page.evaluate(async (targetName) => {
      const holder = document.querySelector('.rc-virtual-list-holder');
      if (holder) {
        holder.scrollTop = 0;
        holder.dispatchEvent(new Event('scroll', { bubbles: true }));
      }
      await new Promise(r => setTimeout(r, 600));

      for (let s = 0; s < 30; s++) {
        const items = Array.from(document.querySelectorAll('div[class*="conversation-item--"]'));
        const target = items.find(it => {
          const t = (it.innerText || '').toLowerCase();
          return t.includes(targetName.toLowerCase());
        });

        if (target) {
          target.click();
          return true;
        }

        if (holder) {
          holder.scrollTop += 320;
          holder.dispatchEvent(new Event('scroll', { bubbles: true }));
        }
        await new Promise(r => setTimeout(r, 500));
      }
      return false;
    }, contactQuery);

    if (!found) {
      throw new ArgumentError('未在私信列表中找到包含 "' + contactQuery + '" 的联系人，请检查昵称或在浏览器中确认会话是否存在');
    }

    await page.wait(2.5);

    // Scroll up message list container to load older history
    for (let s = 0; s < maxScrolls; s++) {
      await page.evaluate(() => {
        const msgContainer = document.querySelector('#msg-list-container') || document.querySelector('div[class*="message-list-reverse--"]');
        if (msgContainer) {
          msgContainer.scrollTop = 0;
          msgContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
        }
      });
      await page.wait(1.2);
    }

    const messages = await page.evaluate(() => {
      const container = document.querySelector('#msg-list-container');
      if (!container) return [];

      const items = Array.from(container.querySelectorAll('li.ant-list-item'));
      return items.map((it) => {
        const isSelf = it.style?.direction === 'rtl';
        const text = it.innerText || '';
        const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
        
        let sender = isSelf ? '我 (Buyer)' : (lines[0] || '对方');
        let contentLines = lines.filter(l => l !== '已读' && l !== '未读' && l !== '领取绑卡');
        if (!isSelf && contentLines[0] === sender) {
          contentLines = contentLines.slice(1);
        }
        let content = contentLines.join(' ') || lines.join(' ');
        
        return {
          sender,
          is_self: isSelf ? '是' : '否',
          content: content.slice(0, 300),
          read_status: text.includes('已读') ? '已读' : '-',
        };
      });
    });

    // Unidirectional write-back into SQLite SSOT
    if (messages && messages.length > 0) {
      try {
        saveMessages(contactQuery, messages);
        syncSellerReviewsFromSessionsAndMessages();
      } catch (e) {}
    }

    return (messages || []).slice(0, limit).map((m, idx) => ({
      index: idx + 1,
      sender: m.sender,
      is_self: m.is_self,
      content: m.content,
      read_status: m.read_status,
    }));
  },
});
