import test from 'node:test';
import assert from 'node:assert/strict';
import { parseItemSkus, validateCandidate, SCHEMA_CONTRACT } from '../clis/goofish/_contract.js';
import { getDb, initSchema, saveCandidates, queryCandidates } from '../clis/goofish/_db.js';

test('Multi-SKU & Different Options Parsing Suite', async (t) => {
  await t.test('1. Authoritatively parses Goofish MTOP multi-SKU response (Anker 140W Case)', () => {
    const mockMtopData = {
      itemDO: {
        itemId: '1075633915367',
        title: 'Anker安克140W智显充，黑神话悟空联名款，全新，正品保',
        minPrice: '158',
        maxPrice: '278',
        skuList: [
          {
            skuId: 6129129601893,
            price: 27800,
            priceInCent: 27800,
            quantity: 2,
            propertyList: [{ actualValueText: '全新', valueText: '全新', propertyText: '颜色' }],
          },
          {
            skuId: 6129129601894,
            price: 19800,
            priceInCent: 19800,
            quantity: 3,
            propertyList: [{ actualValueText: '99新', valueText: '99新', propertyText: '颜色' }],
          },
          {
            skuId: 6129129601895,
            price: 16800,
            priceInCent: 16800,
            quantity: 8,
            propertyList: [{ actualValueText: '裸机', valueText: '裸机', propertyText: '颜色' }],
          },
          {
            skuId: 6140146196066,
            price: 15800,
            priceInCent: 15800,
            quantity: 7,
            propertyList: [{ actualValueText: '待机时间长样机', valueText: '待机时间长样机', propertyText: '颜色' }],
          },
        ],
      },
    };

    const res = parseItemSkus(mockMtopData);
    assert.equal(res.isMultiSku, true);
    assert.equal(res.minPrice, 158);
    assert.equal(res.maxPrice, 278);
    assert.equal(res.skus.length, 4);

    assert.deepEqual(res.skus[0], {
      name: '全新',
      price: 278,
      quantity: 2,
      sku_id: '6129129601893',
    });
    assert.deepEqual(res.skus[3], {
      name: '待机时间长样机',
      price: 158,
      quantity: 7,
      sku_id: '6140146196066',
    });

    assert.ok(res.specs.includes('全新 ¥278 (余2)'));
    assert.ok(res.specs.includes('待机时间长样机 ¥158 (余7)'));
  });

  await t.test('2. Handles items without SKUs (single-price item)', () => {
    const mockSingleItem = {
      itemDO: {
        itemId: '100000000001',
        title: '苹果原装充电头 20W',
        soldPrice: '45.00',
      },
    };

    const res = parseItemSkus(mockSingleItem);
    assert.equal(res.isMultiSku, false);
    assert.equal(res.skus.length, 0);
    assert.equal(res.specs, '-');
  });

  await t.test('3. Candidate validator preserves SKU contract fields', () => {
    const raw = {
      item_id: '1075633915367',
      title: 'Anker安克140W智显充',
      price: '¥158 - ¥278 (多规格)',
      price_num: 158,
      seller: '老张数码',
      specs: '全新 ¥278 | 样机 ¥158',
      min_price: 158,
      max_price: 278,
      skus_json: JSON.stringify([{ name: '全新', price: 278 }]),
    };

    const validated = validateCandidate(raw);
    assert.equal(validated.specs, '全新 ¥278 | 样机 ¥158');
    assert.equal(validated.min_price, 158);
    assert.equal(validated.max_price, 278);
    assert.ok(validated.skus_json.includes('全新'));
  });

  await t.test('4. End-to-End SQLite SSOT persistence and retrieval with SKU fields', () => {
    const db = getDb();
    initSchema(db);

    const testItem = {
      item_id: '999999888881',
      category: 'charger',
      title: '测试多规格140W充电器',
      price: '¥158 - ¥278 (多规格)',
      price_num: 158,
      seller: '测试卖家A',
      location: '北京',
      specs: '全新 ¥278 (余2) | 99新 ¥198 (余3) | 裸机 ¥168 (余8) | 待机时间长样机 ¥158 (余7)',
      min_price: 158,
      max_price: 278,
      skus_json: JSON.stringify([
        { name: '全新', price: 278, quantity: 2 },
        { name: '待机时间长样机', price: 158, quantity: 7 },
      ]),
      item_url: 'https://www.goofish.com/item?id=999999888881',
    };

    saveCandidates([testItem], { filterAccessories: false });

    const retrieved = queryCandidates({ keyword: '测试多规格140W充电器', limit: 1 });
    assert.equal(retrieved.length, 1);
    const row = retrieved[0];
    assert.equal(row.item_id, '999999888881');
    assert.equal(row.price, '¥158 - ¥278 (多规格)');
    assert.equal(row.min_price, 158);
    assert.equal(row.max_price, 278);
    assert.ok(row.specs.includes('全新 ¥278'));
    assert.ok(row.specs.includes('待机时间长样机 ¥158'));
    assert.ok(row.skus_json.includes('全新'));
  });
});
