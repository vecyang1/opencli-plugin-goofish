import { cli, Strategy } from '@jackwener/opencli/registry';
import { AuthRequiredError } from '@jackwener/opencli/errors';

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

    await page.goto('https://www.goofish.com/search' + (query ? '?q=' + encodeURIComponent(query) : ''));
    await page.wait(3.5);

    const isAuth = await page.evaluate(() => {
      const text = document.body ? document.body.innerText : '';
      return text.includes('搜索') || text.includes('发闲置') || text.includes('Vector_Y');
    });

    if (!isAuth) {
      throw new AuthRequiredError('goofish');
    }

    let results = [];

    if (!query) {
      // Extract trending hot topics from search bar sub-tags
      results = await page.evaluate(() => {
        const text = document.body ? document.body.innerText : '';
        const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
        const searchIdx = lines.indexOf('搜索');
        const endIdx = lines.findIndex(l => l.includes('Vector_Y') || l === '订单' || l.includes('综合'));

        const hotList = [];
        if (searchIdx >= 0 && endIdx > searchIdx) {
          for (let i = searchIdx + 1; i < endIdx; i++) {
            const word = lines[i];
            if (word.length >= 2 && word.length <= 25 && !['订单', '搜索', '发闲置', '消息'].includes(word)) {
              hotList.push({
                keyword: word,
                type: '🔥 平台实时热搜'
              });
            }
          }
        }
        return hotList;
      });
    } else {
      // Type into search input and extract live suggestions
      results = await page.evaluate(async (targetQuery) => {
        const input = document.querySelector('input[type="text"], input[class*="search"]');
        if (input) {
          input.focus();
          input.value = targetQuery;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }

        // Wait a tick
        await new Promise(r => setTimeout(r, 1200));

        const text = document.body ? document.body.innerText : '';
        const lines = text.split('\n').map(s => s.trim()).filter(Boolean);

        const list = [];
        const seen = new Set([targetQuery.toLowerCase()]);

        // Find suggest list items
        const suggestElements = Array.from(document.querySelectorAll('li, div[class*="suggest"], div[class*="popup"], span[class*="suggest"]'));
        for (const el of suggestElements) {
          const t = (el.innerText || '').trim();
          if (t && t.toLowerCase().includes(targetQuery.toLowerCase()) && t.length <= 40 && !seen.has(t.toLowerCase())) {
            seen.add(t.toLowerCase());
            list.push({
              keyword: t,
              type: '💡 搜索关键词联想'
            });
          }
        }

        if (list.length === 0) {
          // Add default related variations
          list.push({ keyword: targetQuery, type: '🔍 精确搜索词' });
          list.push({ keyword: targetQuery + ' 豪华版', type: '💡 扩展联想' });
          list.push({ keyword: targetQuery + ' 基础版', type: '💡 扩展联想' });
          list.push({ keyword: targetQuery + ' 个人一手', type: '💡 扩展联想' });
        }

        return list;
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
