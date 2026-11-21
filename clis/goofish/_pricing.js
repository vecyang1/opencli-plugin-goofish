const UNIT_MULTIPLIERS = { 万: 10_000, 亿: 100_000_000 };

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function parseMagnitude(digits, unit) {
  const number = Number(digits);
  if (!Number.isFinite(number)) return null;
  const amount = roundMoney(number * (UNIT_MULTIPLIERS[unit] || 1));
  return amount > 0 ? amount : null;
}

export function parseYuanAmount(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? roundMoney(value) : null;
  }
  if (value == null) return null;
  const raw = String(value).replace(/,/g, '').trim();
  const match = raw.match(/(\d+(?:\.\d+)?)\s*([万亿])?/);
  return match ? parseMagnitude(match[1], match[2]) : null;
}

export function parseYuanRange(value) {
  if (typeof value === 'number') {
    const amount = parseYuanAmount(value);
    return amount == null ? null : { amount, min: amount, max: amount };
  }
  if (value == null) return null;
  const raw = String(value).replace(/,/g, '').trim();
  const range = raw.match(
    /(?:[¥￥]\s*)?(\d+(?:\.\d+)?)\s*([万亿])?\s*(?:-|~|～|—|至)\s*(?:[¥￥]\s*)?(\d+(?:\.\d+)?)\s*([万亿])?/,
  );
  if (range) {
    const min = parseMagnitude(range[1], range[2]);
    const max = parseMagnitude(range[3], range[4]);
    if (min != null && max != null) {
      return {
        amount: Math.min(min, max),
        min: Math.min(min, max),
        max: Math.max(min, max),
      };
    }
  }
  const amount = parseYuanAmount(raw);
  return amount == null ? null : { amount, min: amount, max: amount };
}

export function formatYuan(amount) {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return `¥${Number.isInteger(amount) ? String(amount) : amount.toFixed(2)}`;
}

export function createPriceNode(amount, options = {}) {
  const parsed = parseYuanAmount(amount);
  return {
    amount: parsed,
    display: options.display ?? formatYuan(parsed),
    state: parsed == null ? (options.state || 'not_present') : (options.state || 'observed'),
    source_kind: options.source_kind || 'none',
    source_path: options.source_path || null,
    evidence: options.evidence == null ? null : String(options.evidence).slice(0, 240),
  };
}

export function createPricingSnapshot(parts = {}) {
  const missing = (state = 'not_present') => createPriceNode(null, { state });
  return {
    schema_version: 1,
    currency: 'CNY',
    primary: parts.primary || 'listing',
    listing: parts.listing || missing(),
    original: parts.original || missing(),
    activity: parts.activity || missing(),
    coupon: parts.coupon || missing(),
    estimated: parts.estimated || missing('not_computable'),
    checkout: parts.checkout || missing('not_attempted'),
    skus: parts.skus || [],
    context: parts.context || {},
  };
}

export function priceAuditFields(item = {}) {
  return {
    price_basis: String(item.price_basis || 'legacy').trim() || 'legacy',
    price_source: String(item.price_source || '').trim(),
  };
}

function explicitCoupon(itemDO) {
  const candidates = [
    ['couponPrice', itemDO?.couponPrice],
    ['afterCouponPrice', itemDO?.afterCouponPrice],
    ['couponPriceDO.price', itemDO?.couponPriceDO?.price],
    ['couponPriceDO.priceText', itemDO?.couponPriceDO?.priceText],
  ];
  for (const [path, value] of candidates) {
    const amount = parseYuanAmount(value);
    if (amount != null) return { amount, path, evidence: value };
  }
  return null;
}

function explicitCouponAmount(itemDO) {
  const candidates = [
    ['couponAmount', itemDO?.couponAmount],
    ['couponFee', itemDO?.couponFee],
    ['couponPriceDO.discountFee', itemDO?.couponPriceDO?.discountFee],
  ];
  for (const [path, value] of candidates) {
    const amount = parseYuanAmount(value);
    if (amount != null) return { amount, path, evidence: value };
  }
  return null;
}

export function buildGoofishPricing(itemDO = {}, skuInfo = {}) {
  const soldPrice = parseYuanAmount(itemDO.soldPrice);
  const defaultPrice = parseYuanAmount(itemDO.defaultPrice);
  const skuMin = parseYuanAmount(skuInfo.minPrice);
  const skuMax = parseYuanAmount(skuInfo.maxPrice);
  const useSkuFloor = skuInfo.isMultiSku === true && skuMin != null;
  const listingAmount = useSkuFloor ? skuMin : (soldPrice ?? defaultPrice ?? skuMin);
  const listingPath = useSkuFloor
    ? 'skuList[].price'
    : (soldPrice != null
        ? 'itemDO.soldPrice'
        : (defaultPrice != null ? 'itemDO.defaultPrice' : 'skuList[].price'));
  const listingDisplay = skuInfo.isMultiSku && skuMin != null && skuMax != null && skuMin !== skuMax
    ? `¥${skuMin} - ¥${skuMax}`
    : formatYuan(listingAmount);
  const listing = createPriceNode(listingAmount, {
    display: listingDisplay,
    source_kind: 'mtop_detail',
    source_path: listingPath,
    evidence: soldPrice ?? defaultPrice ?? skuMin,
  });
  if (listing.amount != null) {
    listing.min = skuMin ?? listing.amount;
    listing.max = skuMax ?? listing.amount;
    listing.scope = skuMin != null && skuMax != null && skuMin !== skuMax ? 'range_floor' : 'exact';
  }

  const original = createPriceNode(itemDO.originalPrice, {
    source_kind: 'mtop_detail',
    source_path: 'itemDO.originalPrice',
    evidence: itemDO.originalPrice,
  });
  const activity = createPriceNode(itemDO.promotionPriceDO?.promotionPriceMin, {
    display: formatYuan(parseYuanAmount(itemDO.promotionPriceDO?.promotionPriceMin)),
    source_kind: 'mtop_detail',
    source_path: 'itemDO.promotionPriceDO.promotionPriceMin',
    evidence: itemDO.promotionPriceDO?.promotionName,
  });
  activity.label = itemDO.promotionPriceDO?.promotionName || null;
  activity.discount_amount = parseYuanAmount(itemDO.promotionPriceDO?.minDiscountFeeStr);

  const couponMatch = explicitCoupon(itemDO);
  const couponAmountMatch = explicitCouponAmount(itemDO);
  const coupon = couponMatch
    ? createPriceNode(couponMatch.amount, {
        source_kind: 'mtop_detail',
        source_path: couponMatch.path,
        evidence: couponMatch.evidence,
      })
    : createPriceNode(null, { source_kind: 'mtop_detail', state: 'not_present' });
  if (couponAmountMatch) {
    coupon.discount_amount = couponAmountMatch.amount;
    coupon.discount_path = couponAmountMatch.path;
  }

  return createPricingSnapshot({
    listing,
    original,
    activity,
    coupon,
    estimated: createPriceNode(null, { state: 'not_computable', source_kind: 'mtop_detail' }),
    checkout: createPriceNode(null, { state: 'not_attempted', source_kind: 'checkout' }),
    skus: skuInfo.skus || [],
    context: {
      price_basis: 'listing',
      requires_sku_selection: skuInfo.isMultiSku === true,
      eligibility: 'account_and_region_dependent',
      checkout_observed: false,
    },
  });
}

export function normalizeGoofishSearchCard({ price, context = '', originalPrice = '-' } = {}) {
  const amount = parseYuanAmount(price);
  const text = String(context).replace(/\s+/g, ' ').trim();
  const basis = /券后|券已抵/.test(text)
    ? 'coupon'
    : (/活动价|秒杀价|限时价/.test(text) ? 'activity' : 'displayed_card');
  const node = createPriceNode(amount, {
    display: String(price || ''),
    source_kind: 'search_card_dom',
    source_path: 'goofish:search-card-price',
    evidence: text,
  });
  return {
    price_amount: amount,
    price_num: amount,
    listing_price: basis === 'listing' ? amount : null,
    activity_price: basis === 'activity' ? amount : null,
    coupon_price: basis === 'coupon' ? amount : null,
    estimated_payable: null,
    price_basis: basis,
    price_source: 'search_card_dom',
    original_price_num: parseYuanAmount(originalPrice),
    pricing_json: JSON.stringify(createPricingSnapshot({
      primary: basis,
      listing: basis === 'listing' ? node : createPriceNode(null),
      activity: basis === 'activity' ? node : createPriceNode(null),
      coupon: basis === 'coupon' ? node : createPriceNode(null),
      estimated: createPriceNode(null, { state: 'not_computable' }),
      checkout: createPriceNode(null, { state: 'not_attempted' }),
      context: { price_basis: basis },
    })),
  };
}

function nonNegativeYuanAmount(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? roundMoney(value) : null;
  }
  if (value == null) return null;
  const raw = String(value).replace(/,/g, '').replace(/[¥￥]/g, '').trim();
  if (!/^\d+(?:\.\d+)?$/.test(raw)) return null;
  const amount = Number(raw);
  return Number.isFinite(amount) && amount >= 0 ? roundMoney(amount) : null;
}

function moneyFromPair(centsValue, yuanValue) {
  const centsRaw = typeof centsValue === 'string' ? centsValue.trim() : centsValue;
  const hasCents = centsRaw !== '' && centsRaw != null && Number.isFinite(Number(centsRaw));
  const cents = hasCents ? roundMoney(Number(centsRaw) / 100) : null;
  const yuan = nonNegativeYuanAmount(yuanValue);
  const conflict = cents != null && yuan != null && Math.abs(cents - yuan) >= 0.01;
  return {
    amount: conflict ? null : (yuan ?? cents),
    conflict,
  };
}

export function buildGoofishCheckoutPricing(response = {}, requestedItemId = '') {
  const data = response?.data || {};
  const itemInfo = data.itemInfo || {};
  const confirmBuy = data.yhbConfirmBuy || {};
  const inspectionInfo = data.inspectionInfo || {};
  const postageInfo = data.postageInfo || {};
  const rawPromotions = data.tradePromotion?.promotions;
  const promotions = Array.isArray(rawPromotions)
    ? rawPromotions.map(promotion => {
        const fee = moneyFromPair(promotion?.fee, promotion?.feeText);
        return {
          name: String(promotion?.name || '').trim(),
          type: String(promotion?.type || '').trim(),
          fee: fee.amount,
          fee_conflict: fee.conflict,
          used: promotion?.used === true,
          optional: promotion?.optional === true,
        };
      })
    : null;
  const usedPromotions = Array.isArray(promotions)
    ? promotions.filter(promotion => promotion.used)
    : [];
  const usedPromotionsAllParsed = usedPromotions.every(promotion => promotion.fee != null);
  const usedPromotionAmount = Array.isArray(promotions) && usedPromotionsAllParsed
    ? roundMoney(usedPromotions.reduce((sum, promotion) => sum + (promotion.fee || 0), 0))
    : null;

  const listingAmount = parseYuanAmount(itemInfo.price);
  const confirmAmount = parseYuanAmount(confirmBuy.price);
  const inspection = moneyFromPair(inspectionInfo.inspectionFee, inspectionInfo.inspectionFeeInYuan);
  const postageInfoParsed = moneyFromPair(postageInfo.postage, postageInfo.postageInYuan);
  const inspectionFee = inspection.amount;
  const postage = postageInfoParsed.amount;
  const total = parseYuanAmount(data.totalAmount);
  const componentTotal = confirmAmount != null && inspectionFee != null && postage != null
    ? roundMoney(confirmAmount + inspectionFee + postage)
    : null;
  const checkoutVerified = total != null
    && componentTotal != null
    && Math.abs(roundMoney(total - componentTotal)) < 0.01;
  const promotionUnitConflicts = Array.isArray(promotions)
    ? promotions.flatMap((promotion, index) => (
        promotion.fee_conflict ? [`tradePromotion.promotions[${index}]`] : []
      ))
    : [];
  const responseItemId = String(confirmBuy.itemId || '');
  const targetItemId = String(requestedItemId || responseItemId);

  const listing = createPriceNode(listingAmount, {
    source_kind: 'checkout',
    source_path: 'data.itemInfo.price',
    evidence: itemInfo.price,
  });
  const estimated = createPriceNode(confirmAmount, {
    source_kind: 'checkout',
    source_path: 'data.yhbConfirmBuy.price',
    evidence: confirmBuy.price,
  });
  const promotionExplainsDifference = confirmAmount != null
    && listingAmount != null
    && usedPromotionAmount != null
    && confirmAmount < listingAmount
    && Math.abs(roundMoney(confirmAmount + usedPromotionAmount - listingAmount)) < 0.01;
  const activityExplainsDifference = promotionExplainsDifference
    && usedPromotions.length > 0
    && usedPromotions.every(promotion => /activity|活动|market_single_promotion/i.test(
      `${promotion.type} ${promotion.name}`,
    ));
  const activity = activityExplainsDifference
    ? createPriceNode(confirmAmount, {
        source_kind: 'checkout',
        source_path: 'data.yhbConfirmBuy.price',
        evidence: confirmBuy.price,
      })
    : createPriceNode(null, { source_kind: 'checkout', state: 'not_present' });
  const checkout = createPriceNode(total, {
    source_kind: 'checkout',
    source_path: 'data.totalAmount',
    evidence: data.totalAmount,
    state: total == null ? 'parse_error' : (checkoutVerified ? 'observed' : 'unverified'),
  });

  return {
    item_id: targetItemId,
    response_item_id: responseItemId,
    title: String(itemInfo.title || '').trim(),
    listing_price: listingAmount,
    confirm_price: confirmAmount,
    activity_price: activity.amount,
    promotion_adjusted_price: promotionExplainsDifference ? confirmAmount : null,
    promotion_amount: usedPromotionAmount,
    inspection_fee: inspectionFee,
    postage,
    checkout_total: total,
    checkout_component_total: componentTotal,
    checkout_verified: checkoutVerified,
    unit_conflicts: [
      ...(inspection.conflict ? ['inspectionInfo'] : []),
      ...(postageInfoParsed.conflict ? ['postageInfo'] : []),
      ...promotionUnitConflicts,
    ],
    button_disable: data.buttonDisable === true,
    preview_only: true,
    is_final_payable: false,
    promotions,
    pricing: createPricingSnapshot({
      primary: 'checkout_preview',
      listing,
      activity,
      estimated,
      checkout,
      context: {
        price_basis: 'checkout',
        checkout_state: checkoutVerified ? 'preview_verified' : 'unverified',
        purchase_submitted: false,
        preview_only: true,
        is_final_payable: false,
        has_promotion_data: Array.isArray(promotions),
        used_promotion_types: usedPromotions.map(promotion => promotion.type).filter(Boolean),
        unit_conflicts: [
          ...(inspection.conflict ? ['inspectionInfo'] : []),
          ...(postageInfoParsed.conflict ? ['postageInfo'] : []),
          ...promotionUnitConflicts,
        ],
      },
    }),
  };
}
