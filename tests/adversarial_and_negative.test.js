import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';

import {
  validateCandidate,
  validateSellerReview,
  validateOrder,
  isAccessoryTitle,
  inferCategory,
  classifySellerCommunication,
  UNIVERSAL_JUNK_REGEX,
  GUITAR_ACCESSORY_REGEX,
  DIGITAL_NOISE_REGEX
} from '../src/contract.js';

test('Adversarial & Negative Edge-Case Test Suite', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goofish-adv-test-'));
  const testDbPath = path.join(tmpDir, 'test_adv.db');
  process.env.GOOFISH_DB = testDbPath;

  const {
    saveCandidates,
    queryCandidates,
    purgeJunkCandidates,
    saveOrders,
    queryOrders,
    saveSellerReview,
    getSellerReview,
    getDbStats
  } = await import('../src/db.js');

  await t.test('1. Malformed and Boundary Inputs to Type Validators', () => {
    // Non-object inputs throw TypeError
    assert.throws(() => validateCandidate(null), TypeError);
    assert.throws(() => validateCandidate(undefined), TypeError);
    assert.throws(() => validateCandidate('not an object'), TypeError);
    assert.throws(() => validateCandidate(12345), TypeError);

    assert.throws(() => validateSellerReview(null), TypeError);
    assert.throws(() => validateSellerReview(''), TypeError);
    assert.throws(() => validateOrder(null), TypeError);
    assert.throws(() => validateOrder([]), TypeError);

    // Missing required fields
    assert.throws(() => validateCandidate({}), /item_id is required/);
    assert.throws(() => validateCandidate({ item_id: '-' }), /item_id is required/);
    assert.throws(() => validateCandidate({ item_id: '   ' }), /item_id is required/);
    assert.throws(() => validateCandidate({ item_id: '123' }), /title is required/);
    assert.throws(() => validateCandidate({ item_id: '123', title: '   ' }), /title is required/);

    assert.throws(() => validateSellerReview({ status: 'responsive' }), /Valid seller nickname is required/);
    assert.throws(() => validateSellerReview({ seller: '未知卖家', status: 'responsive' }), /Valid seller nickname is required/);
    assert.throws(() => validateSellerReview({ seller: '-', status: 'responsive' }), /Valid seller nickname is required/);
    assert.throws(() => validateSellerReview({ seller: '吉他小贩', status: 'fraud' }), /Invalid seller review status/);

    assert.throws(() => validateOrder({}), /Valid order_id is required/);
    assert.throws(() => validateOrder({ order_id: '-' }), /Valid order_id is required/);

    // Boundary price formatting & parsing
    const c1 = validateCandidate({ item_id: 'C1', title: '测试', price: '¥1,980.50' });
    assert.equal(c1.price_num, 1980.5);
    assert.equal(c1.price, '¥1,980.50');

    const c2 = validateCandidate({ item_id: 'C2', title: '测试', price: '￥ 2300' });
    assert.equal(c2.price_num, 2300);
    assert.equal(c2.price, '￥ 2300');

    const c3 = validateCandidate({ item_id: 'C3', title: '测试', price: '150元' });
    assert.equal(c3.price_num, 150);
    assert.equal(c3.price, '¥150元');

    const c4 = validateCandidate({ item_id: 'C4', title: '测试', price: '面议' });
    assert.equal(c4.price_num, 0);
    assert.equal(c4.price, '¥0');

    const c5 = validateCandidate({ item_id: 'C5', title: '测试', price: '-' });
    assert.equal(c5.price_num, 0);
    assert.equal(c5.price, '¥0');

    const c6 = validateCandidate({ item_id: 'C6', title: '测试', price: '0' });
    assert.equal(c6.price_num, 0);
    assert.equal(c6.price, '¥0');
  });

  await t.test('2. Exhaustive Accessory & Noise Filtering (Two-Sided Verification)', () => {
    // Non-string or empty returns false safely
    assert.equal(isAccessoryTitle(''), false);
    assert.equal(isAccessoryTitle(null), false);
    assert.equal(isAccessoryTitle(undefined), false);

    // Positive paths (Legitimate products must NOT be filtered)
    assert.equal(isAccessoryTitle('恩雅 NEXG 2N 尼龙静音吉他 黑色', 'nexg2_nylon'), false);
    assert.equal(isAccessoryTitle('拿火 LAVA ME AIR 碳纤维智能吉他 36寸', 'lava_me_air'), false);
    assert.equal(isAccessoryTitle('拿火 LAVA ME 4 四代智能吉他 碳纤维', 'lava_me_4'), false);
    assert.equal(isAccessoryTitle('绿联 15375 9合1 拓展坞 4K60Hz 千兆网口', 'ugreen_hub'), false);
    assert.equal(isAccessoryTitle('苹果 iPad Pro 11寸 M2芯片 128G', 'tablet'), false);

    // Negative paths: Universal junk
    assert.equal(isAccessoryTitle('补差价专拍链接1元'), true);
    assert.equal(isAccessoryTitle('自提专拍 勿拍'), true);
    assert.equal(isAccessoryTitle('图纸手工费 维修服务'), true);
    assert.equal(isAccessoryTitle('原装包装盒 空盒子 出售'), true);
    assert.equal(isAccessoryTitle('展示机壳 模型机 保护膜'), true);

    // Negative paths: Guitar accessories
    assert.equal(isAccessoryTitle('恩雅NEXG2四键踩钉踏板', 'nexg2_nylon'), true);
    assert.equal(isAccessoryTitle('拿火原装加厚琴包双肩背包', 'lava_me_air'), true);
    assert.equal(isAccessoryTitle('监听耳机 专用耳机 音箱线', 'nexg2_nylon'), true);
    assert.equal(isAccessoryTitle('吉他变调夹 拨片 拾音器', 'lava_me_4'), true);
    assert.equal(isAccessoryTitle('吉他音箱电源适配器充电线', 'nexg2_nylon'), true);
    assert.equal(isAccessoryTitle('LAVA ME Play 智能吉他 36寸', 'lava_me_air'), true);

    // Negative paths: Digital accessories
    assert.equal(isAccessoryTitle('绿联 15375 拓展坞硅胶保护套收纳包', 'ugreen_hub'), true);
    assert.equal(isAccessoryTitle('手机壳 保护套 挂绳', 'ugreen_hub'), true);

    // Custom exclusion keywords
    assert.equal(isAccessoryTitle('绿联 15375 9合1 拓展坞 4K60Hz', 'ugreen_hub', ['6合1']), false);
    assert.equal(isAccessoryTitle('绿联 15375 6合1 拓展坞 4K30Hz', 'ugreen_hub', ['6合1']), true);
    assert.equal(isAccessoryTitle('绿联 拓展坞 自提不邮寄', 'ugreen_hub', ['自提']), true);
  });

  await t.test('3. Sanity Price Floor Guard on Save Candidates', () => {
    // Normal candidate saved
    const okSaved = saveCandidates([{
      item_id: 'GUITAR_OK_01',
      title: '恩雅 NEXG 2N 尼龙静音吉他',
      price: '¥1799',
      seller: '好卖家',
    }], { category: 'nexg2_nylon', filterAccessories: true });
    assert.equal(okSaved, 1);

    // Accessory attempt disguised with tiny price (e.g. ¥25 pedal or strings)
    const junkSaved = saveCandidates([{
      item_id: 'GUITAR_JUNK_01',
      title: '恩雅 尼龙 琴弦配件 专用零件',
      price: '¥35',
      seller: '倒爷',
    }], { category: 'nexg2_nylon', filterAccessories: true });
    assert.equal(junkSaved, 0, 'Spurious low-price guitar accessory must be rejected');

    // Query confirms only legitimate guitar exists
    const cands = queryCandidates({ category: 'nexg2_nylon' });
    assert.equal(cands.length, 1);
    assert.equal(cands[0].item_id, 'GUITAR_OK_01');

    // purgeJunkCandidates runs cleanly
    const purged = purgeJunkCandidates();
    assert.equal(purged, 0);
  });

  await t.test('4. Seller Communication Attribution Under Adversarial Questions', () => {
    // Case 1: Buyer explicitly asks "请问有没有现货？有瑕疵吗？没有毛病吧？"
    // Seller replies "有的，全新现货，顺丰包邮"
    // The presence of "没有" in BUYER message must NOT trigger unfit on the seller!
    const dialog1 = classifySellerCommunication({
      session: { contact_name: '正品卖家', last_message: '有的，全新现货，顺丰包邮', trade_status: '-' },
      messages: [
        { sender: 'Buyer', is_self: '是', content: '请问有没有现货？有瑕疵吗？没有毛病吧？' },
        { sender: '正品卖家', is_self: '否', content: '有的，全新现货，顺丰包邮' },
      ]
    });
    assert.equal(dialog1.status, 'responsive');
    assert.ok(dialog1.reason.includes('活跃报价'));

    // Case 2: Seller uses "没有问题" (should NOT trigger unfit due to negative lookahead)
    const dialog2 = classifySellerCommunication({
      session: { contact_name: '良心卖家', last_message: '没有问题，全新未拆封1800', trade_status: '-' },
      messages: [
        { sender: 'Buyer', is_self: '是', content: '琴有问题吗？' },
        { sender: '良心卖家', is_self: '否', content: '没有问题，全新未拆封1800' },
      ]
    });
    assert.equal(dialog2.status, 'responsive');

    // Case 3: Seller explicitly replies "出掉了" or "暂时没货"
    const dialog3 = classifySellerCommunication({
      session: { contact_name: '已出卖家', last_message: '不好意思，出掉了', trade_status: '-' },
      messages: [
        { sender: 'Buyer', is_self: '是', content: '在吗？' },
        { sender: '已出卖家', is_self: '否', content: '不好意思，出掉了' },
      ]
    });
    assert.equal(dialog3.status, 'unfit');

    // Case 4: Trade closed
    const dialog4 = classifySellerCommunication({
      session: { contact_name: '关闭卖家', last_message: '[卖家关闭了订单]', trade_status: '交易关闭' },
      messages: []
    });
    assert.equal(dialog4.status, 'unfit');

    // Case 5: Automated greeting only
    const dialog5 = classifySellerCommunication({
      session: { contact_name: '客服忙', last_message: '自动回复：客服可能在忙请稍候', trade_status: '-' },
      messages: [
        { sender: 'Buyer', is_self: '是', content: '你好' },
        { sender: '客服忙', is_self: '否', content: '自动回复：客服可能在忙请稍候' },
      ]
    });
    assert.equal(dialog5.status, 'ghosted');
  });

  await t.test('5. Idempotent Writes & FTS Synchronization', () => {
    // Upsert same order multiple times with updated price
    const ord1 = [{
      order_id: 'ADV_ORD_01',
      seller: '测试卖家',
      status: '等待卖家发货',
      title: 'USB-C拓展坞',
      price: '¥109.00',
    }];
    saveOrders(ord1);

    const ord2 = [{
      order_id: 'ADV_ORD_01',
      seller: '测试卖家',
      status: '交易成功',
      title: 'USB-C拓展坞 (已确认发货)',
      price: '¥109.00',
    }];
    saveOrders(ord2);

    const q = queryOrders({ query: '拓展坞' });
    assert.equal(q.length, 1, 'Should update existing row, not duplicate');
    assert.equal(q[0].status, '交易成功');
    assert.equal(q[0].title, 'USB-C拓展坞 (已确认发货)');

    // Empty array safety
    assert.equal(saveOrders([]), 0);
    assert.equal(saveCandidates([]), 0);
  });

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
