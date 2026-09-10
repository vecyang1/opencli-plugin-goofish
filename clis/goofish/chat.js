import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError } from '@jackwener/opencli/errors';
import { safeGoto, checkAuth } from './_shared.js';

export const command = cli({
  site: 'goofish',
  name: 'chat',
  access: 'write',
  description: '向指定闲鱼联系人发送或回复私信消息',
  domain: 'www.goofish.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'contact', positional: true, required: true, help: '目标联系人昵称或关键词 (如: 音乐家肖邦)' },
    { name: 'message', positional: true, required: true, help: '要发送的私信文本内容' },
    { name: 'dry-run', type: 'bool', default: false, help: '空跑测试 (只定位会话并填入文本，不触发最终发送)' },
  ],
  columns: [
    'contact',
    'message_sent',
    'status',
    'timestamp',
  ],
  func: async (page, kwargs) => {
    const contactQuery = String(kwargs.contact || kwargs._?.[0] || '').trim();
    const messageText = String(kwargs.message || kwargs._?.[1] || '').trim();
    const dryRun = Boolean(kwargs['dry-run']);

    if (!contactQuery || !messageText) {
      throw new ArgumentError('请指定联系人和消息内容 (如: opencli xianyu chat "音乐家肖邦" "你好，请问宝贝还在吗？")');
    }

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
      throw new ArgumentError('未在私信列表中找到包含 "' + contactQuery + '" 的联系人');
    }

    await page.wait(2.5);

    // Fill textarea and send
    const sendResult = await page.evaluate(({ msg, isDry }) => {
      const textarea = document.querySelector('textarea[placeholder*="请输入消息"], textarea');
      if (!textarea) return { ok: false, error: '未找到聊天输入框' };

      textarea.focus();
      textarea.value = msg;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));

      if (isDry) {
        return { ok: true, dry: true };
      }

      const sendBtn = Array.from(document.querySelectorAll('button, span, div')).find(el => {
        const t = el.innerText ? el.innerText.replace(/\s+/g, '') : '';
        return t === '发送' && el.children.length === 0;
      });

      if (sendBtn) {
        sendBtn.click();
        return { ok: true, method: 'button_click' };
      } else {
        textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        return { ok: true, method: 'enter_key' };
      }
    }, { msg: messageText, isDry: dryRun });

    await page.wait(2);

    return [{
      contact: contactQuery,
      message_sent: messageText,
      status: dryRun ? '空跑测试成功 (Dry Run - Text Filled)' : (sendResult.ok ? '发送成功 (Message Sent)' : '发送失败: ' + sendResult.error),
      timestamp: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
    }];
  },
});
