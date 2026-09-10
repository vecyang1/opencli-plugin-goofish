import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';

test('Push-Style Real-time Sync & Live Queries', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goofish-live-test-'));
  const testDbPath = path.join(tmpDir, 'test_live.db');
  process.env.GOOFISH_DB = testDbPath;

  const { 
    saveCandidates, 
    queryCandidates, 
    saveSellerReview, 
    subscribeLiveQuery 
  } = await import('../src/db.js');

  await t.test('subscribeLiveQuery delivers initial snapshot and push updates on mutations', () => {
    const receivedSnapshots = [];
    const receivedEvents = [];

    // Subscribe to live query on candidates & seller_reviews
    const sub = subscribeLiveQuery({
      tables: ['candidates', 'seller_reviews'],
      queryFn: () => queryCandidates({ category: 'nexg2_nylon' }),
      onChange: (data, evt) => {
        receivedSnapshots.push(data);
        receivedEvents.push(evt);
      },
    });

    // 1. Initial snapshot check
    assert.equal(receivedSnapshots.length, 1);
    assert.equal(receivedSnapshots[0].length, 0);
    assert.equal(receivedEvents[0].initial, true);

    // 2. Mutation 1: Write a candidate into SQLite
    saveCandidates([
      {
        item_id: 'LIVE_01',
        title: '恩雅 NEXG 2N 尼龙静音吉他',
        price: '¥1750',
        seller: '声学实验室',
        location: '广州',
      }
    ], { category: 'nexg2_nylon' });

    // Live query MUST push update immediately
    assert.equal(receivedSnapshots.length, 2);
    assert.equal(receivedSnapshots[1].length, 1);
    assert.equal(receivedSnapshots[1][0].item_id, 'LIVE_01');
    assert.equal(receivedSnapshots[1][0].seller_status, 'unknown');
    assert.equal(receivedEvents[1].action, 'upsert');

    // 3. Mutation 2: Write seller review into SQLite
    saveSellerReview({
      seller: '声学实验室',
      status: 'responsive',
      reason: '当天顺丰包邮发货',
      last_message: '现货在库',
    });

    // Live query MUST push update with dynamically projected status
    assert.equal(receivedSnapshots.length, 3);
    assert.equal(receivedSnapshots[2].length, 1);
    assert.equal(receivedSnapshots[2][0].seller_status, 'responsive');
    assert.equal(receivedSnapshots[2][0].seller_note, '当天顺丰包邮发货');

    // 4. Unsubscribe and test that future mutations are not received
    sub.unsubscribe();

    saveCandidates([
      {
        item_id: 'LIVE_02',
        title: '恩雅 NEXG 2N 黑色款',
        price: '¥1650',
        seller: '另一位卖家',
        location: '北京',
      }
    ], { category: 'nexg2_nylon' });

    assert.equal(receivedSnapshots.length, 3, 'No more updates should be delivered after unsubscribe');
  });

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
