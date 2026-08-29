import { cli, Strategy } from '@jackwener/opencli/registry';
import { AuthRequiredError } from '@jackwener/opencli/errors';

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
    await page.goto('https://www.goofish.com/personal');
    await page.wait(4);

    const isAuth = await page.evaluate(() => {
      const text = document.body ? document.body.innerText : '';
      return text.includes('编辑资料') || text.includes('信用及评价') || text.includes('宝贝') || text.includes('Vector_Y');
    });

    if (!isAuth) {
      throw new AuthRequiredError('goofish');
    }

    const info = await page.evaluate(() => {
      const text = document.body ? document.body.innerText : '';
      const lines = text.split('\n').map(s => s.trim()).filter(Boolean);

      let nick = '';
      const nickEl = document.querySelector('div[class*="nick--"], div[class*="name--"]');
      if (nickEl) nick = nickEl.innerText.trim();
      if (!nick) {
        const editIdx = lines.findIndex(l => l.includes('编辑资料'));
        if (editIdx > 0) nick = lines[editIdx - 4] || lines[editIdx - 3] || '';
      }

      let location = '-';
      let bio = '-';
      let followers = '0';
      let following = '0';

      const followLine = lines.find(l => l.includes('粉丝') || l.includes('关注'));
      if (followLine) {
        const mFollowers = followLine.match(/(\d+)\s*粉丝/);
        if (mFollowers) followers = mFollowers[1];
        const mFollowing = followLine.match(/(\d+)\s*关注/);
        if (mFollowing) following = mFollowing[1];
      }

      const linesAroundFollow = lines.filter((l, i) => i < 25);
      for (const l of linesAroundFollow) {
        if (l.includes('粉丝') && !followers) {
          const m = l.match(/(\d+)/);
          if (m) followers = m[1];
        }
        if (l.includes('关注') && !following) {
          const m = l.match(/(\d+)/);
          if (m) following = m[1];
        }
        if (['越南', '北京', '上海', '广州', '深圳', '杭州', '成都', '武汉', '南京', '重庆', '西安'].some(c => l === c || l.includes(c))) {
          location = l;
        }
        if (['驻外工程师', '工程师', '学生', '摄影师', '设计师'].some(b => l.includes(b))) {
          bio = l;
        }
      }

      let itemsCount = '0';
      let reviewsCount = '0';

      const itemsIdx = lines.findIndex(l => l === '宝贝');
      if (itemsIdx >= 0 && lines[itemsIdx + 1] && lines[itemsIdx + 1].match(/^\d+$/)) {
        itemsCount = lines[itemsIdx + 1];
      } else if (itemsIdx >= 0 && lines[itemsIdx + 2] && lines[itemsIdx + 2].match(/^\d+$/)) {
        itemsCount = lines[itemsIdx + 2];
      }

      const reviewsIdx = lines.findIndex(l => l.includes('信用及评价'));
      if (reviewsIdx >= 0 && lines[reviewsIdx + 1] && lines[reviewsIdx + 1].match(/^\d+$/)) {
        reviewsCount = lines[reviewsIdx + 1];
      } else if (reviewsIdx >= 0 && lines[reviewsIdx + 2] && lines[reviewsIdx + 2].match(/^\d+$/)) {
        reviewsCount = lines[reviewsIdx + 2];
      }

      const creditBadges = [];
      if (text.includes('卖家信用极好')) creditBadges.push('卖家信用极好');
      else if (text.includes('卖家信用优秀')) creditBadges.push('卖家信用优秀');

      if (text.includes('买家信用极好')) creditBadges.push('买家信用极好');
      else if (text.includes('买家信用优秀')) creditBadges.push('买家信用优秀');

      return {
        nick: nick || 'Vector_Y',
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
