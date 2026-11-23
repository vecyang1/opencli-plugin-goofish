import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goofish-pricing-db-'));
process.env.GOOFISH_DB = path.join(tmpDir, 'pricing.db');

const { validateCandidate, validatePriceHistoryRecord } = await import('../clis/goofish/_contract.js');
const { saveCandidates, queryCandidates, recordPriceHistory, queryPriceHistory } = await import('../clis/goofish/_db.js');

test('pricing_json persistence', async (t) => {
  t.after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  const pricing = {
    schema_version: 1,
    currency: 'CNY',
    primary: 'listing',
    listing: { amount: 5950, source_kind: 'mtop_detail' },
    activity: { amount: 5593, source_kind: 'mtop_detail' },
    coupon: { amount: null, state: 'not_present' },
    checkout: { amount: null, state: 'not_attempted' },
  };

  await t.test('candidate validator stringifies pricing evidence', () => {
    const valid = validateCandidate({
      item_id: '100000000010',
      title: '示例测试商品',
      price: '¥5950',
      price_num: 5950,
      pricing_json: pricing,
    });
    assert.equal(JSON.parse(valid.pricing_json).activity.amount, 5593);
  });

  await t.test('history validator keeps pricing evidence', () => {
    const valid = validatePriceHistoryRecord({
      item_id: '100000000010',
      title: '示例测试商品',
      price: '¥5950',
      price_num: 5950,
      pricing_json: pricing,
    });
    assert.equal(JSON.parse(valid.pricing_json).listing.amount, 5950);
  });

  await t.test('candidate and history rows round-trip pricing_json', () => {
    saveCandidates([{
      item_id: '100000000010',
      category: 'laptop',
      title: '示例测试商品',
      price: '¥5950',
      price_num: 5950,
      price_basis: 'listing',
      price_source: 'mtop_detail',
      pricing_json: pricing,
      item_url: 'https://www.goofish.com/item?id=100000000010',
    }], { filterAccessories: false });

    const candidates = queryCandidates({ keyword: '示例测试', limit: 1 });
    assert.equal(candidates.length, 1);
    assert.equal(JSON.parse(candidates[0].pricing_json).activity.amount, 5593);

    recordPriceHistory([{
      item_id: '100000000010',
      keyword: '示例测试',
      title: '示例测试商品',
      price: '¥5950',
      price_num: 5950,
      price_basis: 'listing',
      price_source: 'mtop_detail',
      pricing_json: pricing,
      item_url: 'https://www.goofish.com/item?id=100000000010',
    }], { keyword: '示例测试' });

    const history = queryPriceHistory({ item_id: '100000000010', limit: 5 });
    assert.equal(history.length, 1);
    assert.equal(JSON.parse(history[0].pricing_json).checkout.state, 'not_attempted');
  });

  await t.test('search displayed_card price cannot downgrade verified listing price', () => {
    saveCandidates([{
      item_id: '100000000010',
      category: 'laptop',
      title: '示例测试商品',
      price: '¥5950',
      price_num: 5950,
      price_basis: 'listing',
      price_source: 'mtop_detail',
      pricing_json: {
        ...pricing,
        context: { price_basis: 'listing' },
      },
      item_url: 'https://www.goofish.com/item?id=100000000010',
    }], { filterAccessories: false });

    saveCandidates([{
      item_id: '100000000010',
      category: 'laptop',
      title: '示例测试商品',
      price: '¥5593',
      price_num: 5593,
      price_basis: 'displayed_card',
      price_source: 'search_card_dom',
      pricing_json: {
        ...pricing,
        primary: 'displayed_card',
      },
      item_url: 'https://www.goofish.com/item?id=100000000010',
    }], { filterAccessories: false });

    const row = queryCandidates({ keyword: '示例测试', limit: 1 })[0];
    assert.equal(row.price_num, 5950);
    assert.equal(row.price_basis, 'listing');
    assert.equal(row.price_source, 'mtop_detail');
    assert.equal(JSON.parse(row.pricing_json).context.price_basis, 'listing');
    assert.equal(JSON.parse(row.pricing_json).listing.amount, 5950);
  });
});
