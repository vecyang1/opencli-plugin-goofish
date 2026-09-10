import { cli, Strategy } from '@jackwener/opencli/registry';
import { safeGoto, checkAuth } from './_shared.js';

export const command = cli({
  site: 'goofish',
  name: 'suggest',
  access: 'read',
  description: '获取闲鱼全网热搜词与搜索关键词联想补全 (实时提取平台热门推荐趋势与自动补全关键词)',
  domain: 'www.goofish.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'query', positional: true, required: false, help: '联想前缀词 (若不提供则返回平台实时热搜关键词)' },
    { name: 'limit', type: 'int', default: 20, help: '返回最大数量 (默认 20)' },
  ],
  columns: [
    'index',
    'keyword',
    'type',
    'search_url',
  ],
  func: async (page, kwargs) => {
    const query = String(kwargs.query || kwargs._?.[0] || '').trim();
    const limit = Math.max(1, Math.min(Number(kwargs.limit) || 20, 50));

    await safeGoto(page, 'https://www.goofish.com/search' + (query ? '?q=' + encodeURIComponent(query) : ''));
    await checkAuth(page);

    let results = [];

    if (!query) {
      // Extract trending hot topics from search bar sub-tags or links
      results = await page.evaluate(() => {
        const searchLinks = Array.from(document.querySelectorAll('a[href*="/search?q="]'));
        const hotList = [];
        const seen = new Set();

        for (const a of searchLinks) {
          const t = a.innerText ? a.innerText.trim() : '';
          if (t && t.length >= 2 && t.length <= 25 && !seen.has(t) && !['搜索', '发闲置', '消息', '订单'].includes(t)) {
            seen.add(t);
            hotList.push({
              keyword: t,
              type: '🔥 平台实时热搜',
            });
          }
        }

        return hotList;
      });
    } else {
      // Type in search input to trigger dynamic dropdown suggestions
      results = await page.evaluate(async (prefix) => {
        const input = document.querySelector('input[type="text"], input[placeholder*="搜索"]');
        if (!input) return [];

        input.focus();
        input.value = prefix;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));

        await new Promise(r => setTimeout(r, 1200));

        const dropdownItems = Array.from(document.querySelectorAll('div[class*="suggest-item"], li[class*="suggest"], div[class*="dropdown"] div'));
        const suggestions = [];
        const seen = new Set([prefix]);

        for (const it of dropdownItems) {
          const t = (it.innerText || '').trim().split('\n')[0];
          if (t && t.length >= prefix.length && !seen.has(t) && t.includes(prefix)) {
            seen.add(t);
            suggestions.push({
              keyword: t,
              type: '💡 关键词智能联想',
            });
          }
        }

        return suggestions;
      }, query);
    }

    return (results || []).slice(0, limit).map((r, idx) => ({
      index: idx + 1,
      keyword: r.keyword,
      type: r.type,
      search_url: 'https://www.goofish.com/search?q=' + encodeURIComponent(r.keyword),
    }));
  },
});
