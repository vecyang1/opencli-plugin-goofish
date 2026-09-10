import { cli, Strategy } from '@jackwener/opencli/registry';
import { safeGoto, checkAuth } from './_shared.js';

export const command = cli({
  site: 'goofish',
  name: 'whoami',
  access: 'read',
  description: '快速检查当前登录的闲鱼账号身份、所在地与信用等级',
  domain: 'www.goofish.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [],
  columns: [
    'nick',
    'location',
    'published_count',
    'credit_level',
    'status',
  ],
  func: async (page) => {
    await safeGoto(page, 'https://www.goofish.com/personal');
    await checkAuth(page);

    const data = await page.evaluate(() => {
      // 1. Nickname from semantic class or header link
      let nick = '';
      const nickEl = document.querySelector('span[class*="nick--"], div[class*="nick--"], div[class*="name--"]');
      if (nickEl) nick = nickEl.innerText.trim();
      if (!nick) {
        const personalLink = document.querySelector('a[href*="/personal"]');
        if (personalLink) nick = personalLink.innerText.trim();
      }

      // 2. Location from user info center
      let location = '-';
      const infoSpans = Array.from(document.querySelectorAll('div[class*="infoCenter--"] span, span[class*="infoCenterText--"]'));
      const locSpan = infoSpans.find(s => {
        const t = s.innerText ? s.innerText.trim() : '';
        return t && !t.includes('粉丝') && !t.includes('关注') && t.length <= 12;
      });
      if (locSpan) {
        location = locSpan.innerText.trim();
      }

      // 3. Published items count from tab number
      let itemsCount = '0';
      const numEls = Array.from(document.querySelectorAll('div[class*="num--"]'));
      for (const el of numEls) {
        const parentText = el.parentElement ? el.parentElement.innerText : '';
        if (parentText.includes('宝贝') && el.innerText && /^\d+$/.test(el.innerText.trim())) {
          itemsCount = el.innerText.trim();
          break;
        }
      }

      // 4. Credit badges
      const text = document.body ? document.body.innerText : '';
      const creditBadges = [];
      if (text.includes('卖家信用极好')) creditBadges.push('卖家信用极好');
      else if (text.includes('卖家信用优秀')) creditBadges.push('卖家信用优秀');

      if (text.includes('买家信用极好')) creditBadges.push('买家信用极好');
      else if (text.includes('买家信用优秀')) creditBadges.push('买家信用优秀');

      // Check credit tag images if text badge not present
      if (creditBadges.length === 0) {
        const tagImgs = document.querySelectorAll('img[class*="creditTag--"]');
        if (tagImgs.length > 0) creditBadges.push('信用优秀');
      }

      return {
        nick: nick || '已登录用户',
        location: location || '-',
        published_count: itemsCount + ' 件',
        credit_level: creditBadges.join(' · ') || '正常信用',
        status: '已登录 (Session Active)',
      };
    });

    return [data];
  },
});
