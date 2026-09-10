import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';

test('SSOT and Unidirectional Data Flow', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goofish-ssot-test-'));
  const testDbPath = path.join(tmpDir, 'test_ssot.db');
  process.env.GOOFISH_DB = testDbPath;

  const { 
    saveCandidates, 
    queryCandidates, 
    saveSellerReview, 
    getSellerReview 
  } = await import('../src/db.js');

  await t.test('candidates_view projects seller reputation dynamically without redundant column mutation', () => {
    // 1. Save candidate whose seller has no review yet
    const candidate = {
      item_id: 'SSOT_01',
      title: '拿火 LAVA ME 4 碳纤维智能吉他',
      price: '¥2100',
      seller: '吉他匠人',
      location: '上海',
    };

    saveCandidates([candidate], { category: 'lava_me_4' });

    // Initial query: seller_status should be 'unknown'
    const initial = queryCandidates({ category: 'lava_me_4' });
    assert.equal(initial.length, 1);
    assert.equal(initial[0].seller_status, 'unknown');
    assert.equal(initial[0].seller_note, '');

    // 2. Add seller review into seller_reviews table (The Single Source of Truth for reviews)
    saveSellerReview({
      seller: '吉他匠人',
      status: 'responsive',
      reason: '已确认现货且可当天顺丰发出',
      last_message: '现货可发',
    });

    const rev = getSellerReview('吉他匠人');
    assert.equal(rev.status, 'responsive');

    // 3. Re-read candidates through queryCandidates (Unidirectional Data Flow)
    // The status MUST immediately update to 'responsive' via candidates_view JOIN
    const updated = queryCandidates({ category: 'lava_me_4' });
    assert.equal(updated.length, 1);
    assert.equal(updated[0].seller_status, 'responsive');
    assert.equal(updated[0].seller_note, '已确认现货且可当天顺丰发出');

    // 4. Update seller review to 'unfit' (e.g. seller sold the item)
    saveSellerReview({
      seller: '吉他匠人',
      status: 'unfit',
      reason: '已出，没有现货了',
      last_message: '已经卖掉了',
    });

    // 5. Query with excludeGhosted: true -> The candidate MUST be excluded automatically!
    const filtered = queryCandidates({ category: 'lava_me_4', excludeGhosted: true });
    assert.equal(filtered.length, 0, 'Unfit candidate must be filtered out by SSOT join');

    // Query without filter: shows unfit
    const unfiltered = queryCandidates({ category: 'lava_me_4', excludeGhosted: false });
    assert.equal(unfiltered.length, 1);
    assert.equal(unfiltered[0].seller_status, 'unfit');
    assert.equal(unfiltered[0].seller_note, '已出，没有现货了');
  });

  await t.test('candidates_view dynamically joins on seller_user_id across nickname changes', () => {
    // Save candidate with a specific seller_user_id and an old nickname
    saveCandidates([{
      item_id: 'SSOT_USER_01',
      title: '恩雅 NEXG 2N 尼龙静音吉他',
      price: '¥1750',
      seller: '吉他小贩_旧名',
      seller_user_id: 'USER_998877',
      location: '广州',
    }], { category: 'nexg2_nylon' });

    // Review is recorded under the seller's new nickname, but with the matching seller_user_id
    saveSellerReview({
      seller: '吉他大王_新名',
      seller_user_id: 'USER_998877',
      status: 'responsive',
      reason: '实名数字ID绑定活跃报价',
      last_message: '现货包邮',
    });

    // Query candidate: seller_status MUST match 'responsive' via seller_user_id join!
    const res = queryCandidates({ category: 'nexg2_nylon' });
    const found = res.find(c => c.item_id === 'SSOT_USER_01');
    assert.ok(found, 'Candidate must exist');
    assert.equal(found.seller_status, 'responsive');
    assert.equal(found.seller_note, '实名数字ID绑定活跃报价');
  });

  await t.test('queryCandidates correctly handles category: "all" and excludes accessories', () => {
    // Querying with 'all' or '全部' must return items across all categories
    const allItems = queryCandidates({ category: 'all' });
    assert.ok(allItems.length >= 2, 'category: all must return items from multiple categories');

    const allZh = queryCandidates({ category: '全部' });
    assert.equal(allZh.length, allItems.length);

    // Save an accessory attempt
    saveCandidates([{
      item_id: 'JUNK_PEDAL_01',
      title: '恩雅NEXG2四键无线踩钉踏板',
      price: '¥220',
      seller: '配件商',
    }], { category: 'nexg2_nylon', filterAccessories: true });

    // Must be rejected by saveCandidates or filtered out by queryCandidates
    const afterJunk = queryCandidates({ category: 'all', excludeAccessories: true });
    assert.equal(afterJunk.some(it => it.item_id === 'JUNK_PEDAL_01'), false, 'Accessories must not appear in candidate queries');
  });

  await t.test('SQLite connection runs in WAL mode with busy timeout', async () => {
    const { getDb } = await import('../src/db.js');
    const db = getDb();
    const jm = db.prepare('PRAGMA journal_mode;').get();
    assert.equal(jm.journal_mode.toLowerCase(), 'wal');
    const bt = db.prepare('PRAGMA busy_timeout;').get();
    assert.ok(bt.timeout >= 5000);
  });

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
