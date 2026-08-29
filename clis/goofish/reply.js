import { cli, Strategy } from '@jackwener/opencli/registry';
import { AuthRequiredError, ArgumentError } from '@jackwener/opencli/errors';

export const command = cli({
  site: 'goofish',
  name: 'reply',
  access: 'write',
  description: '回复指定闲鱼联系人私信消息',
  domain: 'www.goofish.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'contact', positional: true, required: true, help: '目标联系人昵称或关键词 (如: 教育优惠)' },
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
      throw new ArgumentError('请指定联系人和消息内容 (如: opencli xianyu chat "教育优惠" "你好，请问发货了吗？")');
    }

    await page.goto('https://www.goofish.com/im');
    await page.wait(4);

    const isAuth = await page.evaluate(() => {
      const text = document.body ? document.body.innerText : '';
      return text.includes('消息') || text.includes('通知消息') || text.includes('Vector_Y');
    });

    if (!isAuth) {
      throw new AuthRequiredError('goofish');
    }

    for (let r = 0; r < 6; r++) {
      const count = await page.evaluate(() => document.querySelectorAll('div[class*="conversation-item--"]').length);
      if (count > 0) break;
      await page.wait(1.5);
    }

    // Reset scrollTop to 0
    await page.evaluate(() => {
      const holder = document.querySelector('.rc-virtual-list-holder');
      if (holder) {
        holder.scrollTop = 0;
        holder.dispatchEvent(new Event('scroll', { bubbles: true }));
      }
    });
    await page.wait(1.5);

    // Select contact
    let found = false;
    for (let s = 0; s < 15; s++) {
      const clicked = await page.evaluate((targetName) => {
        const items = Array.from(document.querySelectorAll('div[class*="conversation-item--"]'));
        const target = items.find(it => (it.innerText || '').toLowerCase().includes(targetName.toLowerCase()));
        if (target) {
          target.click();
          return true;
        }
        const holder = document.querySelector('.rc-virtual-list-holder');
        if (holder) {
          holder.scrollTop += 350;
          holder.dispatchEvent(new Event('scroll', { bubbles: true }));
        }
        return false;
      }, contactQuery);

      if (clicked) {
        found = true;
        break;
      }
      await page.wait(1.2);
    }

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
