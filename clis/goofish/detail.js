import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError, CommandExecutionError } from '@jackwener/opencli/errors';
import { safeGoto } from './_shared.js';
import { saveCandidates } from './_db.js';
import { extractDefectNotes, extractMultiImageDefects, inferCategory } from './_contract.js';

export const command = cli({
  site: 'goofish',
  name: 'detail',
  access: 'read',
  description: '获取闲鱼商品详情 (标题、售价、成色、卖家信誉档案、想要/浏览数、规格及描述)',
  domain: 'www.goofish.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'id', positional: true, required: true, help: '闲鱼商品 ID (如: 1059195860101)' },
  ],
  columns: [
    'item_id',
    'title',
    'price',
    'condition',
    'seller',
    'seller_user_id',
    'location',
    'seller_stats',
    'want_count',
    'browse_count',
    'specs',
    'images',
    'defect_notes',
    'description',
  ],
  func: async (page, kwargs) => {
    let itemId = String(kwargs.id || kwargs._?.[0] || '').trim();
    if (itemId.startsWith('http')) {
      try {
        itemId = new URL(itemId).searchParams.get('id') || itemId;
      } catch (e) {}
    }

    if (!itemId) {
      throw new ArgumentError('请指定要查询的闲鱼商品 ID');
    }

    await safeGoto(page, 'https://www.goofish.com/item?id=' + itemId);
    await page.wait(2.5);

    const data = await page.evaluate(() => {
      const text = document.body ? document.body.innerText : '';
      if (text.includes('网络不见了') || text.includes('快停止散发魅力')) {
        return { ok: false, error: 'item_offline_or_not_found', message: '商品已下架或不存在' };
      }

      const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
      let title = document.title ? document.title.replace(/_闲鱼$/, '').trim() : '';

      let seller = '';
      let location = '-';
      let sellerStatsArr = [];

      // Semantic extraction from seller personal link
      let sellerUserId = '';
      const personalLink = document.querySelector('a[href*="/personal?userId="]');
      if (personalLink) {
        if (personalLink.href) {
          try {
            sellerUserId = new URL(personalLink.href, window.location.origin).searchParams.get('userId') || '';
          } catch (e) {}
        }
        if (personalLink.innerText) {
          const sLines = personalLink.innerText.split('\n').map(s => s.trim()).filter(Boolean);
          if (sLines.length > 0) seller = sLines[0];
          if (sLines.length > 1) location = sLines[1];
          if (sLines.length > 2) sellerStatsArr = sLines.slice(2);
        }
      }

      // Fallback if link not matched
      if (!seller) {
        for (let i = 0; i < Math.min(lines.length, 25); i++) {
          const l = lines[i];
          if (l.includes('来闲鱼') || l.includes('卖出') || l.includes('好评率')) {
            if (!sellerStatsArr.includes(l)) sellerStatsArr.push(l);
            if (!seller && i > 0) {
              seller = lines[i - 2] || lines[i - 1];
            }
          }
        }
      }

      // Extract item images
      const imageEls = Array.from(document.querySelectorAll('div[class*="slider--"] img, div[class*="main--"] img, img[src*="alicdn"], img[src*="tbcdn"]'));
      const images = [];
      for (const img of imageEls) {
        let src = img.src || img.getAttribute('data-src') || '';
        if (src.startsWith('//')) src = 'https:' + src;
        if (
          src &&
          (src.includes('alicdn') || src.includes('tbcdn')) &&
          !src.includes('avatar') &&
          !src.includes('0-mytaobao') &&
          !src.includes('0-mtopupload') &&
          !src.includes('110x10000') &&
          !src.includes('TB1') &&
          !src.includes('TB2') &&
          !src.includes('-tps-') &&
          !images.includes(src)
        ) {
          images.push(src);
        }
      }

      let price = '¥0';
      const priceEl = document.querySelector('span[class*="price--"], div[class*="price--"]');
      if (priceEl && priceEl.innerText && /[\d.]+/.test(priceEl.innerText)) {
        price = '¥' + priceEl.innerText.replace(/[^\d.]/g, '');
      } else {
        const priceMatch = text.match(/直接买\s*[￥¥]\s*([\d.]+)/) || text.match(/[¥￥]\s*([\d.]+)/);
        if (priceMatch) price = '¥' + priceMatch[1];
      }

      let wantCount = '-';
      let browseCount = '-';
      const wantMatch = text.match(/(\d+人想要)/);
      if (wantMatch) wantCount = wantMatch[1];
      const browseMatch = text.match(/(\d+浏览)/);
      if (browseMatch) browseCount = browseMatch[1];

      let specs = '-';
      const specMatch = text.match(/(分类：[^\n]+)/);
      if (specMatch) specs = specMatch[1];

      let descStart = lines.findIndex(l => l.includes('浏览') || l.includes('想要'));
      let descEnd = lines.findIndex(l => l === '聊一聊' || l === '立即购买' || l.includes('为你推荐'));
      let description = '';
      if (descStart >= 0) {
        const endIdx = descEnd > descStart ? descEnd : descStart + 15;
        description = lines.slice(descStart + 1, endIdx).filter(l => !['展开', '收起', '担保交易', '举报', '收藏'].includes(l)).join('\n');
      }

      return {
        ok: true,
        title: title || '闲鱼商品',
        price,
        seller: seller || '闲鱼卖家',
        seller_user_id: sellerUserId || '-',
        location,
        seller_stats: sellerStatsArr.join(' · ') || '正常卖家',
        want_count: wantCount,
        browse_count: browseCount,
        specs,
        images: images.slice(0, 6).join(' | ') || '-',
        description: description.slice(0, 300) || '-',
      };
    });

    if (!data || data.ok === false) {
      throw new CommandExecutionError('查询商品详情失败: ' + (data ? data.message : '商品可能已失效或下架'));
    }

    const category = inferCategory({ keyword: data.title, title: data.title });
    const imgList = (data.images && data.images !== '-') ? data.images.split(' | ').map(s => s.trim()).filter(Boolean) : [];
    const multiInspection = extractMultiImageDefects(data.description || data.title, imgList, category);
    const defectNotes = extractDefectNotes(data.title, data.description);
    const finalNotes = defectNotes !== '封面完好待深检' ? defectNotes : multiInspection.defect_notes;
    const finalCondition = multiInspection.condition;

    // Unidirectional write-back into SQLite SSOT only when valid product data is present
    if (data && data.title && data.title !== '闲鱼商品' && data.price && data.price !== '¥0') {
      try {
        saveCandidates([{
          item_id: itemId,
          category,
          title: data.title,
          price: data.price,
          seller: data.seller,
          seller_user_id: data.seller_user_id,
          location: data.location,
          seller_tag: data.seller_stats,
          condition: finalCondition,
          item_url: `https://www.goofish.com/item?id=${itemId}`,
          image_url: imgList[0] || '',
          images: imgList.join('|'),
          defect_notes: finalNotes,
        }], { filterAccessories: false });
      } catch (e) {}
    }

    return [{
      item_id: itemId,
      title: data.title,
      price: data.price,
      condition: finalCondition,
      seller: data.seller,
      seller_user_id: data.seller_user_id,
      location: data.location,
      seller_stats: data.seller_stats,
      want_count: data.want_count,
      browse_count: data.browse_count,
      specs: data.specs,
      images: data.images,
      defect_notes: finalNotes,
      description: data.description,
    }];
  },
});
