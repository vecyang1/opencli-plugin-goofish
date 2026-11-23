import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildGoofishCheckoutPricing } from '../clis/goofish/_pricing.js';

test('Goofish checkout preview pricing', async (t) => {
  await t.test('command help explains invocation, preview semantics, and safety boundary', () => {
    const source = fs.readFileSync(path.resolve('clis/goofish/checkout.js'), 'utf8');
    assert.match(source, /example: 'opencli goofish checkout 100000000010 -f json'/);
    assert.match(source, /checkout_preview_total = confirm_price \+ inspection_fee \+ postage/);
    assert.match(source, /preview_only=true 且 is_final_payable=false/);
    assert.match(source, /https:\/\/www\.goofish\.com\/item\?id=<id>/);
    assert.match(source, /defaultFormat: 'json'/);
    assert.match(source, /title_preview/);
    assert.match(source, /price_summary/);
    assert.match(source, /checkout_preview_total_display/);
    assert.match(source, /错误输出为 \{"ok":false/);
    assert.match(source, /参数错误 2；登录 77/);
    const columns = source.match(/columns:\s*\[([\s\S]*?)\]/)?.[1] || '';
    assert.doesNotMatch(columns, /promotions_json|price_context|pricing_json/);
  });

  await t.test('keeps listing, promotion, inspection, and final total separate', () => {
    const result = buildGoofishCheckoutPricing({
      ret: ['SUCCESS::调用成功'],
      data: {
        buttonDisable: false,
        itemInfo: {
          price: '5950',
          title: '示例验货宝商品',
        },
        yhbConfirmBuy: {
          itemId: 100000000010,
          price: '5593.00',
        },
        tradePromotion: {
          promotions: [{
            name: '优惠',
            type: 'market_single_promotion',
            fee: 35700,
            feeText: '357.00',
            optional: false,
            used: true,
          }],
        },
        inspectionInfo: {
          inspectionFee: '5490',
          inspectionFeeInYuan: '54.90',
        },
        postageInfo: {
          postage: '0',
          postageInYuan: '0.00',
        },
        totalAmount: '5647.90',
      },
    }, '100000000010');

    assert.equal(result.listing_price, 5950);
    assert.equal(result.confirm_price, 5593);
    assert.equal(result.activity_price, 5593);
    assert.equal(result.promotion_amount, 357);
    assert.equal(result.inspection_fee, 54.9);
    assert.equal(result.postage, 0);
    assert.equal(result.checkout_total, 5647.9);
    assert.equal(result.checkout_component_total, 5647.9);
    assert.equal(result.checkout_verified, true);
    assert.equal(result.pricing.primary, 'checkout_preview');
    assert.equal(result.pricing.context.purchase_submitted, false);
    assert.equal(result.preview_only, true);
    assert.equal(result.is_final_payable, false);
  });

  await t.test('reconciles the sanitized 2026-11-22 read-only render response', () => {
    // Sanitized provenance: actual GET render response captured on 2026-11-22.
    // Item ID and title were replaced; address, user, seller, and payment data removed.
    const response = JSON.parse(fs.readFileSync(
      path.resolve('tests/fixtures/checkout-render-2026-11-22.json'),
      'utf8',
    ));
    const result = buildGoofishCheckoutPricing(response, '123456789012');

    assert.equal(result.response_item_id, '123456789012');
    assert.equal(result.listing_price, 5950);
    assert.equal(result.confirm_price, 5950);
    assert.equal(result.inspection_fee, 54.9);
    assert.equal(result.postage, 0);
    assert.equal(result.checkout_total, 6004.9);
    assert.equal(result.checkout_component_total, 6004.9);
    assert.equal(result.checkout_verified, true);
    assert.equal(result.preview_only, true);
    assert.equal(result.is_final_payable, false);
  });

  await t.test('does not invent a promotion when the API omits promotion data', () => {
    const result = buildGoofishCheckoutPricing({
      ret: ['SUCCESS::调用成功'],
      data: {
        itemInfo: { price: '5950', title: '示例验货宝商品' },
        yhbConfirmBuy: { itemId: 100000000010, price: '5950.00' },
        inspectionInfo: { inspectionFee: '5490', inspectionFeeInYuan: '54.90' },
        postageInfo: { postage: '0', postageInYuan: '0.00' },
        totalAmount: '6004.90',
      },
    }, '100000000010');

    assert.equal(result.listing_price, 5950);
    assert.equal(result.confirm_price, 5950);
    assert.equal(result.activity_price, null);
    assert.equal(result.promotion_amount, null);
    assert.equal(result.checkout_total, 6004.9);
    assert.equal(result.checkout_verified, true);
  });

  await t.test('ignores optional promotions that were not used', () => {
    const result = buildGoofishCheckoutPricing({
      data: {
        itemInfo: { price: '1000' },
        yhbConfirmBuy: { itemId: 100000000001, price: '950' },
        tradePromotion: {
          promotions: [
            { fee: 5000, used: true },
            { fee: 10000, used: false, optional: true },
          ],
        },
        inspectionInfo: { inspectionFee: '0', inspectionFeeInYuan: '0.00' },
        postageInfo: { postage: '0', postageInYuan: '0.00' },
        totalAmount: '950.00',
      },
    }, '100000000001');

    assert.equal(result.promotion_amount, 50);
    assert.equal(result.checkout_total, 950);
    assert.equal(result.checkout_verified, true);
  });

  await t.test('mixed promotions do not become activity price but still explain adjusted price', () => {
    const result = buildGoofishCheckoutPricing({
      data: {
        itemInfo: { price: '1000' },
        yhbConfirmBuy: { itemId: 100000000002, price: '900' },
        tradePromotion: {
          promotions: [
            { name: '活动', type: 'market_single_promotion', fee: 5000, feeText: '50.00', used: true },
            { name: '店铺券', type: 'coupon', fee: 5000, feeText: '50.00', used: true },
          ],
        },
        inspectionInfo: { inspectionFee: '0', inspectionFeeInYuan: '0.00' },
        postageInfo: { postage: '0', postageInYuan: '0.00' },
        totalAmount: '900.00',
      },
    }, '100000000002');

    assert.equal(result.promotion_amount, 100);
    assert.equal(result.activity_price, null);
    assert.equal(result.promotion_adjusted_price, 900);
    assert.equal(result.checkout_verified, true);
  });

  await t.test('unparseable used promotion prevents promotion inference', () => {
    const result = buildGoofishCheckoutPricing({
      data: {
        itemInfo: { price: '1000' },
        yhbConfirmBuy: { itemId: 100000000003, price: '900' },
        tradePromotion: {
          promotions: [{ name: '活动', type: 'market_single_promotion', used: true }],
        },
        inspectionInfo: { inspectionFee: '0', inspectionFeeInYuan: '0.00' },
        postageInfo: { postage: '0', postageInYuan: '0.00' },
        totalAmount: '900.00',
      },
    }, '100000000003');

    assert.equal(result.promotion_amount, null);
    assert.equal(result.promotion_adjusted_price, null);
    assert.equal(result.activity_price, null);
  });

  await t.test('unit conflict and total mismatch stay unverified', () => {
    const unitConflict = buildGoofishCheckoutPricing({
      data: {
        itemInfo: { price: '5950' },
        yhbConfirmBuy: { itemId: 100000000004, price: '5950' },
        inspectionInfo: { inspectionFee: '5490', inspectionFeeInYuan: '5490' },
        postageInfo: { postage: '0', postageInYuan: '0.00' },
        totalAmount: '6004.90',
      },
    }, '100000000004');
    assert.equal(unitConflict.inspection_fee, null);
    assert.equal(unitConflict.checkout_verified, false);
    assert.deepEqual(unitConflict.unit_conflicts, ['inspectionInfo']);

    const totalMismatch = buildGoofishCheckoutPricing({
      data: {
        itemInfo: { price: '5950' },
        yhbConfirmBuy: { itemId: 100000000005, price: '5950' },
        inspectionInfo: { inspectionFee: '5490', inspectionFeeInYuan: '54.90' },
        postageInfo: { postage: '0', postageInYuan: '0.00' },
        totalAmount: '600490',
      },
    }, '100000000005');
    assert.equal(totalMismatch.checkout_verified, false);
    assert.equal(totalMismatch.checkout_component_total, 6004.9);
  });
});
