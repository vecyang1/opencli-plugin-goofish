import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError, CliError, CommandExecutionError } from '@jackwener/opencli/errors';
import { safeGoto, assertGoofishPageUsable } from './_shared.js';
import { saveCandidates } from './_db.js';
import { extractDefectNotes, extractMultiImageDefects, inferCategory, parseItemSkus } from './_contract.js';
import { buildGoofishPricing } from './_pricing.js';

export const command = cli({
  site: 'goofish',
  name: 'detail',
  access: 'read',
  description: '获取闲鱼商品详情 (标题、售价、多规格选项SKU、成色、卖家信誉档案、想要/浏览数及描述)',
  domain: 'www.goofish.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'id', positional: true, required: true, help: '闲鱼商品 ID (如: 1059195860101)' },
    { name: 'screenshot', type: 'str', required: false, help: '详情页实测截图保存路径 (如: /tmp/detail.png)' },
  ],
  columns: [
    'item_id',
    'title',
    'price',
    'price_num',
    'listing_price',
    'original_price',
    'activity_price',
    'activity_discount',
    'coupon_amount',
    'coupon_price',
    'estimated_payable',
    'checkout_total',
    'price_source',
    'price_context',
    'pricing_json',
    'condition',
    'seller',
    'seller_user_id',
    'location',
    'seller_stats',
    'want_count',
    'browse_count',
    'specs',
    'skus_json',
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
    await page.wait(3.0);
    await assertGoofishPageUsable(page);
    await page.wait(1.5);

    if (kwargs.screenshot) {
      try {
        await page.screenshot({ path: kwargs.screenshot });
      } catch (e) {}
    }

    const evalResult = await page.evaluate(async (itemId) => {
      let mtopResponse = null;
      let mtopError = null;
      let mtopErrorRet = [];
      let mtopErrorHasValidationUrl = false;
      const text = document.body ? document.body.innerText : '';
      if (window.lib?.mtop?.request) {
        try {
          const res = await window.lib.mtop.request({
            api: 'mtop.taobao.idle.pc.detail',
            data: { itemId: String(itemId) },
            type: 'POST',
            v: '1.0',
            dataType: 'json',
            needLogin: false,
            needLoginPC: false,
            sessionOption: 'AutoLoginOnly',
            ecode: 0,
          });
          mtopResponse = res || null;
        } catch (e) {
          mtopError = String(e?.message || e?.msg || e?.code || '');
          mtopErrorRet = Array.isArray(e?.ret) ? e.ret.map(String) : [];
          mtopErrorHasValidationUrl = Boolean(e?.data?.url || e?.url);
        }
      } else {
        mtopError = 'window.lib.mtop is unavailable';
      }

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

      let domSpecs = '-';
      const allLines = text.split('\n').map(s => s.trim()).filter(Boolean);
      const optionRegex = /([^¥￥\n]{1,15})[¥￥]\s*([\d.]+)/;
      const foundOptions = [];
      for (const line of allLines) {
        let m = line.match(optionRegex);
        if (m && !line.includes('直接买') && !line.includes('想要') && !line.includes('浏览')) {
          foundOptions.push(`${m[1].trim()} ¥${m[2]}`);
        }
      }
      if (foundOptions.length > 0) {
        domSpecs = Array.from(new Set(foundOptions)).join(' | ');
      } else {
        const specMatch = text.match(/(分类：[^\n]+)/);
        if (specMatch) domSpecs = specMatch[1];
      }

      let wantCount = '-';
      let browseCount = '-';
      const wantMatch = text.match(/(\d+人想要)/);
      if (wantMatch) wantCount = wantMatch[1];
      const browseMatch = text.match(/(\d+浏览)/);
      if (browseMatch) browseCount = browseMatch[1];

      let descStart = lines.findIndex(l => l.includes('浏览') || l.includes('想要'));
      let descEnd = lines.findIndex(l => l === '聊一聊' || l === '立即购买' || l.includes('为你推荐'));
      let description = '';
      if (descStart >= 0) {
        const endIdx = descEnd > descStart ? descEnd : descStart + 15;
        description = lines.slice(descStart + 1, endIdx).filter(l => !['展开', '收起', '担保交易', '举报', '收藏'].includes(l)).join('\n');
      }

      return {
        ok: true,
        mtopResponse,
        mtopError,
        mtopErrorRet,
        mtopErrorHasValidationUrl,
        domData: {
          title: title || '闲鱼商品',
          seller: seller || '闲鱼卖家',
          seller_user_id: sellerUserId || '-',
          location,
          seller_stats: sellerStatsArr.join(' · ') || '正常卖家',
          want_count: wantCount,
          browse_count: browseCount,
          specs: domSpecs,
          images: images.slice(0, 8).join(' | ') || '-',
          description: description.slice(0, 500) || '-',
        },
      };
    }, itemId);

    if (!evalResult || evalResult.ok === false) {
      throw new CommandExecutionError('查询商品详情失败: ' + (evalResult ? evalResult.message : '商品可能已失效或下架'));
    }

    const mtopResponse = evalResult.mtopResponse || {};
    const ret = Array.isArray(mtopResponse.ret)
      ? mtopResponse.ret.map(String)
      : [String(mtopResponse.ret || '')];
    const retText = ret.join(' ');
    const mtopData = mtopResponse.data || {};
    const mtopErrorText = [
      retText,
      evalResult.mtopError || '',
      ...(Array.isArray(evalResult.mtopErrorRet) ? evalResult.mtopErrorRet : []),
    ].join(' ');
    if (/FAIL_SYS_USER_VALIDATE|RGV587_ERROR|captcha|punish/i.test(mtopErrorText)
      || mtopData.url || evalResult.mtopErrorHasValidationUrl) {
      throw new CliError(
        'SECURITY_BLOCK',
        '闲鱼要求安全验证，未读取 DOM 价格作为替代。',
        '自动验证未清除，或验证在详情请求期间出现；请在浏览器中手动完成验证后重试。',
      );
    }
    if (evalResult.mtopError || Object.keys(mtopResponse).length === 0) {
      throw new CommandExecutionError(
        '闲鱼商品详情接口未返回结果',
        evalResult.mtopError || 'Refresh the page and retry after confirming login.',
      );
    }
    if (!ret[0]?.startsWith('SUCCESS')) {
      throw new CommandExecutionError(
        '闲鱼商品详情接口调用失败',
        retText.slice(0, 200) || 'The detail API returned no success status.',
      );
    }

    const itemDO = mtopData.itemDO || {};
    const responseItemId = String(itemDO.itemId || '');
    if (responseItemId !== itemId) {
      throw new CommandExecutionError(
        '闲鱼详情响应与请求商品 ID 不一致',
        `Requested ${itemId}, received ${responseItemId || 'missing itemId'}.`,
      );
    }
    const sellerDO = mtopData.sellerDO || {};
    const domData = evalResult.domData || {};

    const skuInfo = parseItemSkus(mtopData);
    const pricing = buildGoofishPricing(itemDO, skuInfo);

    const title = String(itemDO.title || domData.title || '闲鱼商品').trim();
    if (!title || title === '闲鱼商品' || title === '-') {
      throw new CommandExecutionError('闲鱼详情缺少可验证的商品标题');
    }
    const seller = String(sellerDO.nick || sellerDO.uniqueName || domData.seller || '闲鱼卖家').trim();
    const sellerUserId = String(sellerDO.sellerId || domData.seller_user_id || '-').trim();
    const location = String(sellerDO.publishCity || sellerDO.city || domData.location || '-').trim();
    const wantCount = itemDO.wantCnt ? `${itemDO.wantCnt}人想要` : domData.want_count;
    const browseCount = itemDO.browseCnt ? `${itemDO.browseCnt}浏览` : domData.browse_count;
    const description = String(itemDO.desc || domData.description || '-').trim();

    if (pricing.listing.amount == null) {
      throw new CommandExecutionError(
        '闲鱼详情缺少可验证的商品标价',
        'The detail response contained no supported listing price field.',
      );
    }
    const displayPrice = pricing.listing.display || `¥${pricing.listing.amount}`;
    const priceNum = pricing.listing.amount;
    const activityDiscount = pricing.activity.discount_amount ?? null;
    const couponAmount = pricing.coupon.discount_amount ?? null;
    const priceContext = JSON.stringify(pricing.context);

    const finalSpecs = skuInfo.specs !== '-' ? skuInfo.specs : domData.specs;
    const category = inferCategory({ keyword: title, title });
    const imgList = (domData.images && domData.images !== '-') ? domData.images.split(' | ').map(s => s.trim()).filter(Boolean) : [];
    const multiInspection = extractMultiImageDefects(description || title, imgList, category);
    const defectNotes = extractDefectNotes(title, description);
    const finalNotes = defectNotes !== '封面完好待深检' ? defectNotes : multiInspection.defect_notes;
    const finalCondition = multiInspection.condition;

    // Unidirectional write-back into SQLite SSOT only when valid product data is present
    if (title && title !== '闲鱼商品' && displayPrice && displayPrice !== '¥0') {
      try {
        saveCandidates([{
          item_id: itemId,
          category,
          title,
          price: displayPrice,
          price_num: priceNum,
          original_price: pricing.original.amount,
          activity_price: pricing.activity.amount,
          coupon_amount: couponAmount,
          coupon_price: pricing.coupon.amount,
          estimated_payable: pricing.estimated.amount,
          checkout_total: pricing.checkout.amount,
          price_basis: 'listing',
          price_source: pricing.listing.source_kind,
          price_context: priceContext,
          pricing_json: pricing,
          seller,
          seller_user_id: sellerUserId,
          location,
          seller_tag: domData.seller_stats,
          condition: finalCondition,
          specs: finalSpecs,
          min_price: skuInfo.minPrice,
          max_price: skuInfo.maxPrice,
          skus_json: skuInfo.skusJson,
          item_url: `https://www.goofish.com/item?id=${itemId}`,
          image_url: imgList[0] || '',
          images: imgList.join('|'),
          defect_notes: finalNotes,
        }], { filterAccessories: false });
      } catch (e) {}
    }

    return [{
      item_id: itemId,
      title,
      price: displayPrice,
      price_num: priceNum,
      listing_price: pricing.listing.amount,
      original_price: pricing.original.amount,
      activity_price: pricing.activity.amount,
      activity_discount: activityDiscount,
      coupon_amount: couponAmount,
      coupon_price: pricing.coupon.amount,
      estimated_payable: pricing.estimated.amount,
      checkout_total: pricing.checkout.amount,
      price_basis: 'listing',
      price_source: pricing.listing.source_kind,
      price_context: priceContext,
      pricing_json: JSON.stringify(pricing),
      condition: finalCondition,
      seller,
      seller_user_id: sellerUserId,
      location,
      seller_stats: domData.seller_stats,
      want_count: wantCount,
      browse_count: browseCount,
      specs: finalSpecs,
      skus_json: skuInfo.skusJson,
      images: domData.images,
      defect_notes: finalNotes,
      description: description.slice(0, 300),
    }];
  },
});
