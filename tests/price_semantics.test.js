import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildGoofishPricing,
  normalizeGoofishSearchCard,
  parseYuanRange,
} from '../clis/goofish/_pricing.js';

test('Goofish price semantics', async (t) => {
  await t.test('activity price and discount stay separate from listing price', () => {
    const pricing = buildGoofishPricing({
      itemId: '100000000010',
      title: '示例活动商品',
      soldPrice: '5950',
      originalPrice: '7999',
      promotionPriceDO: {
        promotionName: '活动价',
        minDiscountFeeStr: '357.00',
        promotionPriceMin: '5593.00',
      },
    }, {
      isMultiSku: false,
      skus: [],
      minPrice: 0,
      maxPrice: 0,
    });

    assert.equal(pricing.listing.amount, 5950);
    assert.equal(pricing.original.amount, 7999);
    assert.equal(pricing.activity.amount, 5593);
    assert.equal(pricing.activity.discount_amount, 357);
    assert.equal(pricing.estimated.amount, null);
    assert.equal(pricing.checkout.amount, null);
    assert.equal(pricing.listing.source_path, 'itemDO.soldPrice');
    assert.equal(pricing.activity.source_path, 'itemDO.promotionPriceDO.promotionPriceMin');
  });

  await t.test('multi-SKU range has explicit floor and individual SKU data', () => {
    const pricing = buildGoofishPricing({
      itemId: '100000000011',
      title: '示例多规格商品',
      soldPrice: '158',
    }, {
      isMultiSku: true,
      minPrice: 158,
      maxPrice: 278,
      skus: [
        { name: '全新', price: 278, quantity: 2, sku_id: '6129129601893' },
        { name: '裸机', price: 168, quantity: 8, sku_id: '6129129601895' },
        { name: '样机', price: 158, quantity: 7, sku_id: '6140146196066' },
      ],
    });

    assert.equal(pricing.listing.amount, 158);
    assert.equal(pricing.listing.min, 158);
    assert.equal(pricing.listing.max, 278);
    assert.equal(pricing.listing.scope, 'range_floor');
    assert.equal(pricing.skus.length, 3);
    assert.equal(pricing.context.requires_sku_selection, true);
  });

  await t.test('multi-SKU amount follows the same floor used by display and min', () => {
    const pricing = buildGoofishPricing({
      itemId: '100000000011',
      title: '示例多规格商品',
      soldPrice: '200',
    }, {
      isMultiSku: true,
      minPrice: 158,
      maxPrice: 278,
      skus: [
        { name: '低配', price: 158, quantity: 1, sku_id: 'sku-low' },
        { name: '高配', price: 278, quantity: 1, sku_id: 'sku-high' },
      ],
    });

    assert.equal(pricing.listing.amount, 158);
    assert.equal(pricing.listing.min, 158);
    assert.equal(pricing.listing.max, 278);
    assert.equal(pricing.listing.display, '¥158 - ¥278');
    assert.equal(pricing.listing.scope, 'range_floor');
    assert.equal(pricing.listing.source_path, 'skuList[].price');
  });

  await t.test('search card labels the displayed basis instead of pretending it is always listing price', () => {
    const coupon = normalizeGoofishSearchCard({
      price: '¥5899',
      context: '券后价 ¥5899 原价 ¥6939',
      originalPrice: '¥6939',
    });
    assert.equal(coupon.coupon_price, 5899);
    assert.equal(coupon.listing_price, null);
    assert.equal(coupon.price_basis, 'coupon');
    assert.equal(coupon.original_price_num, 6939);

    const unlabeled = normalizeGoofishSearchCard({
      price: '¥6900',
      context: '示例商品 几乎全新',
    });
    assert.equal(unlabeled.price_basis, 'displayed_card');
    assert.equal(unlabeled.listing_price, null);
  });

  await t.test('coupon availability alone does not imply an applied post-coupon price', () => {
    const card = normalizeGoofishSearchCard({
      price: '¥6900',
      context: '可用券 ¥6900',
    });

    assert.equal(card.price_basis, 'displayed_card');
    assert.equal(card.coupon_price, null);
    assert.equal(card.listing_price, null);
  });

  await t.test('does not concatenate a price range into one amount', () => {
    assert.deepEqual(parseYuanRange('¥158 - ¥278'), {
      amount: 158,
      min: 158,
      max: 278,
    });
    const card = normalizeGoofishSearchCard({
      price: '¥158 - ¥278',
      context: '多规格',
    });
    assert.equal(card.price_num, 158);
  });

  await t.test('verification handling delegates to the shared captcha solver', () => {
    const shared = fs.readFileSync(path.resolve('clis/goofish/_shared.js'), 'utf8');
    assert.match(shared, /solveAlibabaCaptcha/);
    assert.match(shared, /Automatic slider attempts/);
    const captcha = fs.readFileSync(path.resolve('clis/goofish/_captcha.js'), 'utf8');
    assert.match(captcha, /Input\.dispatchMouseEvent/);
    assert.match(captcha, /OPENCLI_SOLVE_CAPTCHA/);
  });
});
