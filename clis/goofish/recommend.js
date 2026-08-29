import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError } from '@jackwener/opencli/errors';

export const command = cli({
  site: 'goofish',
  name: 'recommend',
  access: 'read',
  description: '提取商品页面「为你推荐」相似品与关联生态SKU (基于闲鱼AI推荐流发现隐藏好价竞品、同类替代品与周边生态)',
  domain: 'www.goofish.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'target', positional: true, required: true, help: '商品ID或商品URL (如: 1076198967894 或 https://www.goofish.com/item?id=1076198967894)' },
    { name: 'limit', type: 'int', default: 20, help: '提取推荐SKU最大数量 (默认 20)' },
    { name: 'filter', type: 'string', default: 'all', help: '品类过滤: all (全部), same (同类乐器/替代品), gear (配件硬件), study (教程/素材)' },
  ],
  columns: [
    'index',
    'item_id',
    'title',
    'price',
    'relation_type',
    'tags',
    'seller_nick',
    'item_url',
  ],
  func: async (page, kwargs) => {
    let target = String(kwargs.target || kwargs._?.[0] || '').trim();
    if (!target) {
      throw new ArgumentError('请指定要提取推荐的商品ID或链接');
    }

    let itemId = target;
    try {
      if (target.startsWith('http')) {
        itemId = new URL(target).searchParams.get('id') || itemId;
      }
    } catch (e) {}

    const url = 'https://www.goofish.com/item?id=' + itemId;
    await page.evaluate((u) => {
      window.location.href = u;
    }, url);
    await page.wait(3.5);

    // Scroll down to bottom to trigger Vue/React recommendations
    for (let scrollStep = 0; scrollStep < 4; scrollStep++) {
      await page.evaluate(() => {
        window.scrollBy(0, 1000);
      });
      await page.wait(1.2);
    }

    const recs = await page.evaluate((targetItemId) => {
      const allLinks = Array.from(document.querySelectorAll('a[href*="item?id="]'));
      const results = [];
      const seenIds = new Set([targetItemId]);

      for (const a of allLinks) {
        let id = '';
        try {
          id = new URL(a.href, window.location.origin).searchParams.get('id') || '';
        } catch (e) {}

        if (!id || seenIds.has(id)) continue;
        seenIds.add(id);

        const fullText = (a.innerText || '').trim();
        const lines = fullText.split('\n').map(s => s.trim()).filter(Boolean);

        let title = lines.find(l => l.length > 4 && !l.startsWith('¥') && !l.startsWith('￥') && !['包邮', '全新', '在售', '轻微使用痕迹', '几乎全新'].includes(l)) || lines[0] || '';
        if (!title || title.includes('为你推荐') || title.includes('投诉') || title.includes('举报') || title === '发闲置') continue;

        let price = '¥0';
        const pMatch = fullText.match(/[¥￥]\s*([\d.]+)/);
        if (pMatch) price = '¥' + pMatch[1];

        // Parse tags
        const tags = [];
        if (fullText.includes('包邮')) tags.push('包邮');
        if (fullText.includes('可小刀')) tags.push('可小刀');
        if (fullText.includes('全新')) tags.push('全新');
        if (fullText.includes('95新') || fullText.includes('几乎全新')) tags.push('95新');
        if (fullText.includes('轻微使用痕迹')) tags.push('轻微使用痕迹');
        if (fullText.includes('回头客')) tags.push('回头客多');
        if (fullText.includes('卖家信用极好')) tags.push('信用极好');

        // Extract seller
        let seller = lines.find(l => l.includes('卖家') || (l.length <= 12 && l.length >= 2 && !l.startsWith('¥') && !l.includes('人想要') && !tags.includes(l) && l !== title)) || '-';
        if (seller.includes('卖家信用')) seller = seller.replace(/卖家信用.*/, '').trim();

        // Classify relation type
        let relationType = '【💡 关联推荐/其他】';
        const lowerTitle = title.toLowerCase();
        
        const isTutorial = /教程|课程|乐谱|曲谱|教学|课件|自学|视频课|讲义|带课件/.test(lowerTitle);
        const isAudioSoftware = /音源|插件|工程|伴奏|suno|编曲|合成器|daw|logic|cubase|fl studio|kontakt/.test(lowerTitle);
        const isGearAccessory = /琴包|琴盒|背带|拾音器|踏板|效果器|充电底座|支架|琴弦|拨片|耳麦|麦克风|琴箱/.test(lowerTitle);
        const isGuitarInstrument = /nexg|吉他|guitar|电吉他|智能吉他|静音吉他|民谣吉他|陈楚生|恩雅|enya|尤克里里|贝斯/.test(lowerTitle);

        if (isGuitarInstrument && !isTutorial && !isAudioSoftware && !isGearAccessory) {
          relationType = '【🔥 同类乐器/替代竞品】';
        } else if (isGearAccessory) {
          relationType = '【🎸 配件/硬件生态】';
        } else if (isTutorial) {
          relationType = '【📚 教程/曲谱教学】';
        } else if (isAudioSoftware) {
          relationType = '【🎵 编曲/数字音源】';
        }

        results.push({
          item_id: id,
          title,
          price,
          relation_type: relationType,
          tags: tags.join(' · ') || '普通',
          seller_nick: seller || '-',
          item_url: 'https://www.goofish.com/item?id=' + id,
        });
      }

      return results;
    }, itemId);

    let filtered = recs;
    const filterType = kwargs.filter || 'all';
    if (filterType === 'same') {
      filtered = recs.filter(r => r.relation_type.includes('同类乐器') || r.relation_type.includes('替代竞品'));
    } else if (filterType === 'gear') {
      filtered = recs.filter(r => r.relation_type.includes('配件') || r.relation_type.includes('硬件'));
    } else if (filterType === 'study') {
      filtered = recs.filter(r => r.relation_type.includes('教程') || r.relation_type.includes('音源'));
    }

    const limit = kwargs.limit || 20;
    return filtered.slice(0, limit).map((r, idx) => ({
      index: idx + 1,
      ...r
    }));
  },
});
