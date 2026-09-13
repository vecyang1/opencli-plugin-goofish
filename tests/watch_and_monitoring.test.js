import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';

import {
  isAccessoryTitle,
  inferCategory,
  validateCandidate,
  sendWebhookNotification,
  extractMultiImageDefects
} from '../src/contract.js';

test('Periodic Monitoring & Watch Engine Test Suite', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goofish-watch-test-'));
  const testDbPath = path.join(tmpDir, 'test_watch.db');
  process.env.GOOFISH_DB = testDbPath;

  const {
    saveCandidates,
    queryCandidates,
    subscribeLiveQuery,
    dbEmitter,
  } = await import('../src/db.js');

  await t.test('1. Category Inference for NEXG 2N Nylon and Variations', () => {
    assert.equal(inferCategory({ keyword: 'nexg 2n' }), 'nexg2_nylon');
    assert.equal(inferCategory({ keyword: 'nexg2n 尼龙的那个版本' }), 'nexg2_nylon');
    assert.equal(inferCategory({ keyword: '恩雅 NEXG 2N 智能吉他' }), 'nexg2_nylon');
    assert.equal(inferCategory({ title: '转让自用恩雅nexg 2n尼龙款' }), 'nexg2_nylon');
    assert.equal(inferCategory({ category: 'nexg2_nylon' }), 'nexg2_nylon');
  });

  await t.test('2. Strict Nylon vs Steel String & Accessory Filtering (Two-Sided)', () => {
    // Legitimate nylon guitar titles (Must PASS)
    assert.equal(isAccessoryTitle('恩雅 NEXG 2N 黑色 尼龙弦款 几乎全新', 'nexg2_nylon'), false);
    assert.equal(isAccessoryTitle('转让自用 恩雅 NEXG 2N 智能吉他 原装全套', 'nexg2_nylon'), false);
    assert.equal(isAccessoryTitle('NEXG 2N 古典尼龙弦版 98新', 'nexg2_nylon'), false);

    // Steel string titles masquerading or mixed in (Must BE BLOCKED for nexg2_nylon)
    assert.equal(isAccessoryTitle('恩雅 NEXG 2 黑色 钢弦款 智能音频吉他', 'nexg2_nylon'), true);
    assert.equal(isAccessoryTitle('出 NEXG 2代 民谣钢弦版 95新', 'nexg2_nylon'), true);
    assert.equal(isAccessoryTitle('NEXG 2代 电吉他款 非尼龙', 'nexg2_nylon'), true);

    // Guitar accessories (Must BE BLOCKED)
    assert.equal(isAccessoryTitle('恩雅 NEXG 2N 专用原装无线踏板', 'nexg2_nylon'), true);
    assert.equal(isAccessoryTitle('NEXG2 原装加厚琴包 背带', 'nexg2_nylon'), true);
    assert.equal(isAccessoryTitle('恩雅 NEXG 2代 麦克风+耳机配件包', 'nexg2_nylon'), true);
    assert.equal(isAccessoryTitle('恩雅 NEXG 2 尼龙琴弦一套', 'nexg2_nylon'), true);
  });

  await t.test('3. Reactive Live Query: New Arrival & Price Drop Event Emission', async () => {
    const events = [];
    const seenPrices = new Map();

    const sub = subscribeLiveQuery({
      tables: ['candidates'],
      queryFn: () => queryCandidates({ category: 'nexg2_nylon' }),
      onChange: (candidates, evt) => {
        if (evt?.initial) return;
        for (const c of candidates) {
          const old = seenPrices.get(c.item_id);
          if (old === undefined) {
            events.push({ type: 'new_arrival', item_id: c.item_id, price: c.price_num });
            seenPrices.set(c.item_id, c.price_num);
          } else if (c.price_num < old) {
            events.push({ type: 'price_drop', item_id: c.item_id, old_price: old, new_price: c.price_num });
            seenPrices.set(c.item_id, c.price_num);
          }
        }
      },
    });

    try {
      // Step A: Initial item arrives
      saveCandidates([
        {
          item_id: 'NEXG_001',
          title: '恩雅 NEXG 2N 尼龙弦 极品成色',
          price: '¥2200',
          category: 'nexg2_nylon',
          seller: '卖家小王',
          condition: '95新',
        },
      ], { category: 'nexg2_nylon' });

      assert.equal(events.length, 1);
      assert.equal(events[0].type, 'new_arrival');
      assert.equal(events[0].item_id, 'NEXG_001');
      assert.equal(events[0].price, 2200);

      // Step B: Item drops price
      saveCandidates([
        {
          item_id: 'NEXG_001',
          title: '恩雅 NEXG 2N 尼龙弦 极品成色 急出降价',
          price: '¥1850',
          category: 'nexg2_nylon',
          seller: '卖家小王',
        },
      ], { category: 'nexg2_nylon' });

      assert.equal(events.length, 2);
      assert.equal(events[1].type, 'price_drop');
      assert.equal(events[1].item_id, 'NEXG_001');
      assert.equal(events[1].old_price, 2200);
      assert.equal(events[1].new_price, 1850);

      // Step C: Adversarial steel string insertion is dropped, NO event fired
      saveCandidates([
        {
          item_id: 'NEXG_STEEL_FAKE',
          title: '恩雅 NEXG 2 钢弦款 原盒',
          price: '¥1500',
          category: 'nexg2_nylon',
          seller: '卖家李四',
        },
      ], { category: 'nexg2_nylon' });

      assert.equal(events.length, 2); // Unchanged!
    } finally {
      sub.unsubscribe();
    }
  });

  await t.test('4. Webhook Notification Dispatch and Dead-Endpoint Resilience', async () => {
    // 4a. Start a local mock HTTP server to verify webhook receipt
    const receivedPayloads = [];
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          receivedPayloads.push(JSON.parse(body));
        } catch (e) {}
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
    });

    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const webhookUrl = `http://127.0.0.1:${port}/webhook/goofish`;

    // Send valid payload
    const testPayload = {
      event: 'candidate_alert',
      source: 'goofish-watch',
      data: {
        event_type: 'new_arrival',
        item_id: 'NEXG_001',
        title: '恩雅 NEXG 2N 尼龙弦',
        price: '¥1850',
      },
    };

    const success = await sendWebhookNotification(webhookUrl, testPayload);
    assert.equal(success, true);
    assert.equal(receivedPayloads.length, 1);
    assert.equal(receivedPayloads[0].data.item_id, 'NEXG_001');

    server.close();

    // 4b. Dead-endpoint resilience: sending to a closed port must NOT throw
    const deadUrl = `http://127.0.0.1:${port}/webhook/goofish`;
    const failedGracefully = await sendWebhookNotification(deadUrl, testPayload);
    assert.equal(failedGracefully, false);
  });

  await t.test('5. Multi-Image Defect Notes and Condition Neutrality', async () => {
    const rawItem = {
      title: '转让 恩雅 NEXG 2N 智能吉他 尼龙款',
      description: '吉他成色很好，只有背面有几道细微划痕，正面完好，琴颈笔直没有任何暗病暗伤，功能全好带原装包',
      images: [
        'https://img.alicdn.com/front_cover.jpg',
        'https://img.alicdn.com/back_scratches.jpg',
        'https://img.alicdn.com/neck.jpg',
      ],
    };

    const defects = extractMultiImageDefects(rawItem.description, rawItem.images);
    assert.match(defects.defect_notes, /背面有细微划痕/);
    assert.equal(defects.condition, '9新(背面细微划痕)');

    const itemWithDefects = validateCandidate({
      item_id: 'NEXG_IMG_01',
      title: rawItem.title,
      price: '¥1900',
      images: rawItem.images.join('|'),
      defect_notes: defects.defect_notes,
      condition: defects.condition,
    });

    assert.equal(itemWithDefects.images.split('|').length, 3);
    assert.match(itemWithDefects.defect_notes, /背面有细微划痕/);
    assert.equal(itemWithDefects.condition, '9新(背面细微划痕)');
  });
});
