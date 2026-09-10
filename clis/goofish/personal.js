import { cli, Strategy } from '@jackwener/opencli/registry';
import { safeGoto, checkAuth } from './_shared.js';

export const command = cli({
  site: 'goofish',
  name: 'personal',
  access: 'read',
  description: '获取闲鱼个人主页概览 (用户昵称、所在地、粉丝/关注数、宝贝数、信用及评价数)',
  domain: 'www.goofish.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [],
  columns: [
    'nick',
    'location',
    'bio',
    'followers',
    'following',
    'items_count',
    'reviews_count',
    'credit_level',
  ],
  func: async (page) => {
    await safeGoto(page, 'https://www.goofish.com/personal');
    await checkAuth(page);

    const info = await page.evaluate(() => {
      // 1. Nickname
      let nick = '';
      const nickEl = document.querySelector('span[class*="nick--"], div[class*="nick--"], div[class*="name--"]');
      if (nickEl) nick = nickEl.innerText.trim();

      // 2. Info Center: Location, Followers, Following
      let location = '-';
      let followers = '0';
      let following = '0';

      const infoSpans = Array.from(document.querySelectorAll('div[class*="infoCenter--"] span, span[class*="infoCenterText--"]'));
      for (const s of infoSpans) {
        const t = s.innerText ? s.innerText.trim() : '';
        if (t.includes('粉丝')) {
          const m = t.match(/(\d+)/);
          if (m) followers = m[1];
        } else if (t.includes('关注')) {
          const m = t.match(/(\d+)/);
          if (m) following = m[1];
        } else if (t && !location || location === '-') {
          if (t.length <= 15) {
            location = t;
          }
        }
      }

      // 3. Bio / signature
      let bio = '-';
      const bioEl = document.querySelector('div[class*="bottom--"], div[class*="desc--"]');
      if (bioEl && bioEl.innerText) {
        bio = bioEl.innerText.trim();
      }

      // 4. Tab numbers: items count & reviews count
      let itemsCount = '0';
      let reviewsCount = '0';

      const numEls = Array.from(document.querySelectorAll('div[class*="num--"]'));
      for (const el of numEls) {
        const parentText = el.parentElement ? el.parentElement.innerText : '';
        const numText = el.innerText ? el.innerText.trim() : '';
        if (/^\d+$/.test(numText)) {
          if (parentText.includes('宝贝') && itemsCount === '0') {
            itemsCount = numText;
          } else if (parentText.includes('评价') && reviewsCount === '0') {
            reviewsCount = numText;
          }
        }
      }

      // 5. Credit level
      const text = document.body ? document.body.innerText : '';
      const creditBadges = [];
      if (text.includes('卖家信用极好')) creditBadges.push('卖家信用极好');
      else if (text.includes('卖家信用优秀')) creditBadges.push('卖家信用优秀');

      if (text.includes('买家信用极好')) creditBadges.push('买家信用极好');
      else if (text.includes('买家信用优秀')) creditBadges.push('买家信用优秀');

      if (creditBadges.length === 0) {
        const tagImgs = document.querySelectorAll('img[class*="creditTag--"]');
        if (tagImgs.length > 0) creditBadges.push('信用优秀');
      }

      return {
        nick: nick || '已登录用户',
        location: location || '-',
        bio: bio || '-',
        followers: followers + ' 粉丝',
        following: following + ' 关注',
        items_count: itemsCount + ' 件',
        reviews_count: reviewsCount + ' 条',
        credit_level: creditBadges.join(' · ') || '正常信用',
      };
    });

    return [info];
  },
});
