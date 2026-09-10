import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';

test('SQLite SSOT db operations', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goofish-db-test-'));
  const testDbPath = path.join(tmpDir, 'test_goofish.db');
  process.env.GOOFISH_DB = testDbPath;

  const { 
    saveOrders, queryOrders, 
    saveFavorites, queryFavorites, 
    saveSessions, querySessions, 
    saveMessages, queryMessages, 
    saveCandidates, queryCandidates,
    saveSellerReview, getSellerReview, querySellerReviews,
    syncSellerReviewsFromSessionsAndMessages,
    getDbStats 
  } = await import('../src/db.js');

  await t.test('saves and queries orders with FTS', () => {
    const orders = [
      {
        order_id: 'ORD_1001',
        seller: '卡西莫多多',
        seller_user_id: '2206922764533',
        status: '交易成功',
        title: 'AI写实感人像提示词Skill',
        price: '¥9.99',
        spec_tag: '电子资料',
        item_id: '789123',
        order_url: 'https://www.goofish.com/order-detail?orderId=ORD_1001',
      },
      {
        order_id: 'ORD_1002',
        seller: '干涸的春',
        seller_user_id: '2202412846061',
        status: '等待卖家发货',
        title: 'TK爆款视频复刻skill包智能体',
        price: '¥9.90',
        spec_tag: 'AI工具',
        item_id: '789124',
        order_url: 'https://www.goofish.com/order-detail?orderId=ORD_1002',
      }
    ];

    const count = saveOrders(orders);
    assert.equal(count, 2);

    const found = queryOrders({ query: '提示词' });
    assert.equal(found.length, 1);
    assert.equal(found[0].order_id, 'ORD_1001');

    const byStatus = queryOrders({ status: '发货' });
    assert.equal(byStatus.length, 1);
    assert.equal(byStatus[0].order_id, 'ORD_1002');
  });

  await t.test('saves and queries favorites', () => {
    const favs = [
      {
        item_id: 'ITEM_001',
        title: '任天堂Switch OLED 512G',
        price: '¥1400',
        discount: '降¥100',
        status: '在售',
        item_url: 'https://www.goofish.com/item?id=ITEM_001',
      }
    ];

    const count = saveFavorites(favs);
    assert.equal(count, 1);

    const found = queryFavorites({ query: 'Switch' });
    assert.equal(found.length, 1);
    assert.equal(found[0].item_id, 'ITEM_001');
  });

  await t.test('saves and queries sessions and messages', () => {
    const sessions = [
      {
        contact_name: '音乐家肖邦',
        trade_status: '等待买家发货',
        last_message: '您好，有奶白，湖水蓝',
        time: '05-17',
        unread: '2',
        has_item: '是',
      },
      {
        contact_name: '泰裤辣乐器批发',
        trade_status: '-',
        last_message: '没有',
        time: '09-08',
        unread: '-',
        has_item: '是',
      },
      {
        contact_name: '小夏吉他批发',
        trade_status: '-',
        last_message: '没回复说明客服可能在忙～您可以点击右上角',
        time: '09-08',
        unread: '-',
        has_item: '是',
      }
    ];

    saveSessions(sessions);
    const qSess = querySessions({ query: '肖邦' });
    assert.equal(qSess.length, 1);
    assert.equal(qSess[0].unread, '2');

    const msgs = [
      { sender: '我 (Buyer)', is_self: '是', content: '这是什么拾音器', read_status: '已读' },
      { sender: '音乐家肖邦', is_self: '否', content: '这个是芬兰品牌拾音器', read_status: '-' },
    ];

    saveMessages('音乐家肖邦', msgs);
    const qMsgs = queryMessages('音乐家肖邦');
    assert.equal(qMsgs.length, 2);
    assert.equal(qMsgs[0].content, '这是什么拾音器');
  });

  await t.test('syncs seller reviews and manages candidates with SSOT', () => {
    // Seller reviews
    const reviewedCount = syncSellerReviewsFromSessionsAndMessages();
    assert.ok(reviewedCount >= 2);

    const ghostReview = getSellerReview('小夏吉他批发');
    assert.ok(ghostReview);
    assert.equal(ghostReview.status, 'ghosted');

    const unfitReview = getSellerReview('泰裤辣乐器批发');
    assert.ok(unfitReview);
    assert.equal(unfitReview.status, 'unfit');

    // Candidates
    const candidates = [
      {
        item_id: 'CAND_01',
        title: '恩雅NEXG 2N 黑色古典尼龙吉他',
        price: '¥1780',
        seller: '泰裤辣乐器批发',
        location: '广东',
        condition: '全新',
        guarantee: '普通',
        item_url: 'https://www.goofish.com/item?id=CAND_01',
        image_url: 'https://img.alicdn.com/test_01.jpg',
      },
      {
        item_id: 'CAND_02',
        title: '恩雅NEXG2黑色豪华版 尼龙弦自用',
        price: '¥1800',
        seller: '海上逃跑的话梅',
        location: '四川',
        condition: '几乎全新',
        guarantee: '包邮',
        item_url: 'https://www.goofish.com/item?id=CAND_02',
        image_url: 'https://img.alicdn.com/test_02.jpg',
      },
      {
        item_id: 'CAND_03',
        title: '拿火LAVA ME air 36寸黑色碳纤维',
        price: '¥1500',
        seller: '森悦乐器_Guitar',
        location: '北京',
        condition: '全新',
        guarantee: '包邮',
        item_url: 'https://www.goofish.com/item?id=CAND_03',
        image_url: 'https://img.alicdn.com/test_03.jpg',
      }
    ];

    const cCount = saveCandidates(candidates, { category: 'nexg2_nylon', keyword: 'nexg 2n' });
    assert.equal(cCount, 3);

    // Filter candidates excluding ghosted/unfit
    const validCandidates = queryCandidates({ category: 'nexg2_nylon', excludeGhosted: true });
    assert.equal(validCandidates.length, 2);
    assert.equal(validCandidates[0].item_id, 'CAND_03'); // price ¥1500 sorted first

    // Query with price filter
    const priceFiltered = queryCandidates({ minPrice: 1700, maxPrice: 1850 });
    assert.equal(priceFiltered.length, 2);
  });

  await t.test('computes database statistics', () => {
    const stats = getDbStats();
    assert.equal(stats.orders_stored, 2);
    assert.equal(stats.favorites_stored, 1);
    assert.equal(stats.sessions_stored, 3);
    assert.equal(stats.messages_stored, 2);
    assert.equal(stats.candidates_stored, 3);
    assert.ok(stats.seller_reviews_stored >= 2);
    assert.equal(stats.total_spent, '¥9.99');
  });

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
