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

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
