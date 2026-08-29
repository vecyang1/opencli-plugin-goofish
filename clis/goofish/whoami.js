import { cli, Strategy } from '@jackwener/opencli/registry';
import { AuthRequiredError } from '@jackwener/opencli/errors';

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
    await page.goto('https://www.goofish.com/personal');
    await page.wait(4);

    const isAuth = await page.evaluate(() => {
      const text = document.body ? document.body.innerText : '';
      return text.includes('编辑资料') || text.includes('信用及评价') || text.includes('宝贝') || text.includes('Vector_Y');
    });

    if (!isAuth) {
      throw new AuthRequiredError('goofish');
    }

    const data = await page.evaluate(() => {
      const text = document.body ? document.body.innerText : '';
      const lines = text.split('\n').map(s => s.trim()).filter(Boolean);

      let nick = '';
      const nickEl = document.querySelector('div[class*="nick--"], div[class*="name--"]');
      if (nickEl) nick = nickEl.innerText.trim();

      let location = '-';
      for (const l of lines.slice(0, 20)) {
        if (['越南', '北京', '上海', '广州', '深圳', '杭州', '成都', '武汉'].includes(l)) {
          location = l;
        }
      }

      let itemsCount = '0';
      const itemsIdx = lines.findIndex(l => l === '宝贝');
      if (itemsIdx >= 0 && lines[itemsIdx + 1] && lines[itemsIdx + 1].match(/^\d+$/)) {
        itemsCount = lines[itemsIdx + 1];
      }

      const creditBadges = [];
      if (text.includes('卖家信用极好')) creditBadges.push('卖家信用极好');
      else if (text.includes('卖家信用优秀')) creditBadges.push('卖家信用优秀');

      if (text.includes('买家信用极好')) creditBadges.push('买家信用极好');
      else if (text.includes('买家信用优秀')) creditBadges.push('买家信用优秀');

      return {
        nick: nick || 'Vector_Y',
        location: location || '-',
        published_count: itemsCount + ' 件',
        credit_level: creditBadges.join(' · ') || '正常信用',
        status: '已登录 (Session Active)',
      };
    });

    return [data];
  },
});
