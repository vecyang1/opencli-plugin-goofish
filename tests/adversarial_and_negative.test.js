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
  extractDefectNotes,
  extractMultiImageDefects,
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

    // Two-sided positive paths: Legitimate 15375 features must NOT be falsely filtered!
    assert.equal(isAccessoryTitle('绿联 15375 9合1 拓展坞 4K60Hz向下兼容1080P', 'ugreen_hub'), false, '1080P backward compatibility must not reject 4K60Hz dock');
    assert.equal(isAccessoryTitle('绿联 15375 9合1 拓展坞 4K 60Hz 兼容 2K', 'ugreen_hub'), false, '2K compatibility must not reject 4K60Hz dock');
    assert.equal(isAccessoryTitle('绿联 15375 9合1 拓展坞 读卡速度100MB/s', 'ugreen_hub'), false, '100MB/s card reader speed must not trigger 100M Ethernet mismatch');
    assert.equal(isAccessoryTitle('绿联 15375 9合1 拓展坞 铝合金外壳 全新', 'ugreen_hub'), false, 'Aluminum alloy casing must not be rejected as dummy shell');
    assert.equal(isAccessoryTitle('绿联 15375 9合1 拓展坞 铝外壳 全新', 'ugreen_hub'), false, 'Aluminum casing synonym must not be rejected as dummy shell');
    assert.equal(isAccessoryTitle('绿联 15375 9合1 拓展坞 全铝外壳', 'ugreen_hub'), false, 'All-aluminum casing must not be rejected');
    assert.equal(isAccessoryTitle('绿联 15375 9合1 拓展坞 外壳无划痕 功能正常', 'ugreen_hub'), false, 'Casing cosmetic assertion must not be rejected');
    assert.equal(isAccessoryTitle('绿联 15375 9合1 拓展坞 外壳有划痕 功能正常', 'ugreen_hub'), false, 'Casing wear disclosure must not be rejected');
    assert.equal(isAccessoryTitle('绿联 15375 9合1 拓展坞 外壳有些许划痕 功能完好', 'ugreen_hub'), false, 'Casing slight scratch must not be rejected');
    assert.equal(isAccessoryTitle('绿联 15375 9合1 拓展坞 外壳有轻微磕碰', 'ugreen_hub'), false, 'Casing slight bump must not be rejected');
    assert.equal(isAccessoryTitle('绿联 15375 9合1 拓展坞 外壳磨损 功能正常', 'ugreen_hub'), false, 'Casing abrasion must not be rejected');
    assert.equal(isAccessoryTitle('绿联 15375 9合1 拓展坞 外壳有细微划痕', 'ugreen_hub'), false, 'Casing fine scratch must not be rejected');
    assert.equal(isAccessoryTitle('绿联 15375 9合1 拓展坞 4K 非30Hz 千兆网口', 'ugreen_hub'), false, 'Negated 30Hz must not reject genuine dock');
    assert.equal(isAccessoryTitle('绿联 15375 9合1 拓展坞 非百兆网口 4K60Hz', 'ugreen_hub'), false, 'Negated 100M must not reject genuine dock');
    assert.equal(isAccessoryTitle('绿联 15375 9合1 拓展坞 吊打5合1 4K60Hz', 'ugreen_hub'), false, 'Superiority comparison must not trigger mismatch');
    assert.equal(isAccessoryTitle('绿联 15375 9合1 拓展坞 秒杀6合1', 'ugreen_hub'), false, 'Comparison must not trigger mismatch');
    assert.equal(isAccessoryTitle('绿联 15375 9合1 拓展坞 刚收到拆封自用出', 'ugreen_hub'), false, 'Recently received自用 must not be rejected as wanted post');
    assert.equal(isAccessoryTitle('绿联 15375 9合1 Type-C 转换器 4K60Hz 千兆', 'ugreen_hub'), false, 'Type-C converter synonym must not be rejected');
    assert.equal(isAccessoryTitle('绿联 15375 9合1 拓展坞 编织线款 送网线', ''), false, 'Empty category must not falsely classify UGREEN hub as guitar accessory');
    assert.equal(isAccessoryTitle('绿联 15375 9合1 拓展坞 非6合1', 'ugreen_hub'), false, 'Negated port count must not reject genuine dock');

    // Negative paths: Universal junk & buyer wanted posts
    assert.equal(isAccessoryTitle('补差价专拍链接1元'), true);
    assert.equal(isAccessoryTitle('自提专拍 勿拍'), true);
    assert.equal(isAccessoryTitle('图纸手工费 维修服务'), true);
    assert.equal(isAccessoryTitle('原装包装盒 空盒子 出售'), true);
    assert.equal(isAccessoryTitle('展示机壳 模型机 保护膜'), true);
    assert.equal(isAccessoryTitle('求购 绿联 15375 拓展坞', 'ugreen_hub'), true, 'Buyer wanted posts must be rejected');
    assert.equal(isAccessoryTitle('收购 绿联 15375 拓展坞', 'ugreen_hub'), true, 'Acquisition posts must be rejected');
    assert.equal(isAccessoryTitle('带价收 绿联 15375', 'ugreen_hub'), true, 'Priced collection posts must be rejected');
    assert.equal(isAccessoryTitle('求收 恩雅 nexg 2n', 'nexg2_nylon'), true, 'Guitar collection posts must be rejected');
    assert.equal(isAccessoryTitle('收一台 恩雅 nexg 2n 智能吉他', 'nexg2_nylon'), true, 'Buyer guitar wanted posts must be rejected');

    // Negative paths: Guitar accessories & non-nylon steel strings
    assert.equal(isAccessoryTitle('恩雅NEXG2四键踩钉踏板', 'nexg2_nylon'), true);
    assert.equal(isAccessoryTitle('拿火原装加厚琴包双肩背包', 'lava_me_air'), true);
    assert.equal(isAccessoryTitle('监听耳机 专用耳机 音箱线', 'nexg2_nylon'), true);
    assert.equal(isAccessoryTitle('吉他变调夹 拨片 拾音器', 'lava_me_4'), true);
    assert.equal(isAccessoryTitle('吉他音箱电源适配器充电线', 'nexg2_nylon'), true);
    assert.equal(isAccessoryTitle('LAVA ME Play 智能吉他 36寸', 'lava_me_air'), true);
    assert.equal(isAccessoryTitle('恩雅 nexg 2 钢弦款 非2N 非尼龙', 'nexg2_nylon'), true, 'Steel string with 非2N must be rejected from nylon');
    assert.equal(isAccessoryTitle('恩雅 nexg 2 钢弦款 不带尼龙弦', 'nexg2_nylon'), true, 'Steel string with 不带尼龙弦 must be rejected from nylon');
    assert.equal(isAccessoryTitle('恩雅 nexg 2 钢弦款 没有尼龙弦', 'nexg2_nylon'), true, 'Steel string with 没有尼龙弦 must be rejected from nylon');
    assert.equal(isAccessoryTitle('恩雅 nexg 2 钢弦款 绝非2N', 'nexg2_nylon'), true, 'Steel string with 绝非2N must be rejected from nylon');
    assert.equal(isAccessoryTitle('恩雅 nexg 2 钢弦款 并非古典', 'nexg2_nylon'), true, 'Steel string with 并非古典 must be rejected from nylon');

    // Negative paths: Digital accessories & dummy shells
    assert.equal(isAccessoryTitle('绿联 15375 拓展坞硅胶保护套收纳包', 'ugreen_hub'), true);
    assert.equal(isAccessoryTitle('绿联 15375 拓展坞收纳袋', 'ugreen_hub'), true);
    assert.equal(isAccessoryTitle('绿联 15375 拓展坞保护壳', 'ugreen_hub'), true);
    assert.equal(isAccessoryTitle('绿联 拓展坞硅胶套', 'ugreen_hub'), true);
    assert.equal(isAccessoryTitle('绿联拓展坞防尘塞', 'ugreen_hub'), true);
    assert.equal(isAccessoryTitle('绿联拓展坞外壳', 'ugreen_hub'), true);
    assert.equal(isAccessoryTitle('绿联 15375 拓展坞 纯外壳', 'ugreen_hub'), true);
    assert.equal(isAccessoryTitle('绿联 15375 拓展坞 替换外壳', 'ugreen_hub'), true);
    assert.equal(isAccessoryTitle('绿联Type-C转接头', 'ugreen_hub'), true);
    assert.equal(isAccessoryTitle('手机壳 保护套 挂绳', 'ugreen_hub'), true);

    // Negative paths: UGREEN 15375 specification mismatch (digits, Chinese numerals, English, and negation bypass)
    assert.equal(isAccessoryTitle('绿联 拓展坞 6合1 4K30Hz', 'ugreen_hub'), true);
    assert.equal(isAccessoryTitle('绿联 拓展坞 6合一', 'ugreen_hub'), true, '6合一 Chinese numeral must be rejected');
    assert.equal(isAccessoryTitle('绿联 拓展坞 六合一', 'ugreen_hub'), true, '六合一 Chinese numeral must be rejected');
    assert.equal(isAccessoryTitle('绿联 拓展坞 5合1', 'ugreen_hub'), true);
    assert.equal(isAccessoryTitle('绿联 拓展坞 5合一', 'ugreen_hub'), true, '5合一 Chinese numeral must be rejected');
    assert.equal(isAccessoryTitle('绿联 拓展坞 五合一', 'ugreen_hub'), true, '五合一 Chinese numeral must be rejected');
    assert.equal(isAccessoryTitle('绿联 拓展坞 6 in 1', 'ugreen_hub'), true, '6 in 1 English must be rejected');
    assert.equal(isAccessoryTitle('绿联 10合1 拓展坞', 'ugreen_hub'), true);
    assert.equal(isAccessoryTitle('绿联 10合一 拓展坞', 'ugreen_hub'), true, '10合一 must be rejected');
    assert.equal(isAccessoryTitle('绿联 十合一 拓展坞', 'ugreen_hub'), true, '十合一 must be rejected');
    assert.equal(isAccessoryTitle('绿联 15375 拓展坞 6合1', 'ugreen_hub'), true, '15375 6合1 port mismatch must be rejected');
    assert.equal(isAccessoryTitle('绿联 15375 拓展坞 5合一', 'ugreen_hub'), true, '15375 5合一 port mismatch must be rejected');
    assert.equal(isAccessoryTitle('绿联 6合1 拓展坞 非15375', 'ugreen_hub'), true, '6合1 非15375 must be rejected');
    assert.equal(isAccessoryTitle('绿联 9合1 拓展坞 百兆网口', 'ugreen_hub'), true);
    assert.equal(isAccessoryTitle('绿联 9合1 拓展坞 100兆网口', 'ugreen_hub'), true, '100兆网口 must be rejected');
    assert.equal(isAccessoryTitle('绿联 拓展坞 百兆网口 非千兆', 'ugreen_hub'), true, '百兆网口 非千兆 must be rejected');
    assert.equal(isAccessoryTitle('绿联 9合1 拓展坞 4K30Hz', 'ugreen_hub'), true);
    assert.equal(isAccessoryTitle('绿联 拓展坞 4K@30Hz', 'ugreen_hub'), true, '4K@30Hz must be rejected');
    assert.equal(isAccessoryTitle('绿联 拓展坞 4K/30Hz', 'ugreen_hub'), true, '4K/30Hz must be rejected');
    assert.equal(isAccessoryTitle('绿联 拓展坞 4K 30Hz 非60Hz', 'ugreen_hub'), true, '4K 30Hz 非60Hz must be rejected');

    // Custom exclusion keywords
    assert.equal(isAccessoryTitle('绿联 15375 9合1 拓展坞 4K60Hz', 'ugreen_hub', ['6合1']), false);
    assert.equal(isAccessoryTitle('绿联 15375 6合1 拓展坞 4K30Hz', 'ugreen_hub', ['6合1']), true);
    assert.equal(isAccessoryTitle('绿联 拓展坞 自提不邮寄', 'ugreen_hub', ['自提']), true);
  });

  await t.test('3. Sanity Price Floor Guard on Save Candidates', () => {
    // Normal candidate saved (Guitar)
    const okSaved = saveCandidates([{
      item_id: 'GUITAR_OK_01',
      title: '恩雅 NEXG 2N 尼龙静音吉他',
      price: '¥1799',
      seller: '好卖家',
    }], { category: 'nexg2_nylon', filterAccessories: true });
    assert.equal(okSaved, 1);

    // Normal candidate saved (UGREEN Hub)
    const hubOkSaved = saveCandidates([{
      item_id: 'HUB_OK_01',
      title: '绿联 15375 9合1 拓展坞 4K60Hz 千兆网口',
      price: '¥109',
      seller: '数码卖家',
    }], { category: 'ugreen_hub', filterAccessories: true });
    assert.equal(hubOkSaved, 1);

    // Accessory attempt disguised with tiny price (e.g. ¥25 pedal or strings)
    const junkSaved = saveCandidates([{
      item_id: 'GUITAR_JUNK_01',
      title: '恩雅 尼龙 琴弦配件 专用零件',
      price: '¥35',
      seller: '倒爷',
    }], { category: 'nexg2_nylon', filterAccessories: true });
    assert.equal(junkSaved, 0, 'Spurious low-price guitar accessory must be rejected');

    // Low price junk for ugreen_hub (< ¥60)
    const hubJunkSaved = saveCandidates([{
      item_id: 'HUB_JUNK_01',
      title: '绿联 拓展坞 数据线配件 专用线',
      price: '¥25',
      seller: '配件商',
    }], { category: 'ugreen_hub', filterAccessories: true });
    assert.equal(hubJunkSaved, 0, 'Spurious low-price digital accessory must be rejected');

    // Zero-price unpriced / display / wanted post rejection (price_num <= 0)
    const zeroJunkSaved = saveCandidates([{
      item_id: 'HUB_ZERO_01',
      title: '绿联 15375 拓展坞 个人自用',
      price: '¥0',
      seller: '展示用户',
    }], { category: 'ugreen_hub', filterAccessories: true });
    assert.equal(zeroJunkSaved, 0, 'Zero price display/wanted post must be rejected from candidate SSOT');

    // Query confirms legitimate guitar and hub exist
    const candsGuitar = queryCandidates({ category: 'nexg2_nylon' });
    assert.equal(candsGuitar.length, 1);
    assert.equal(candsGuitar[0].item_id, 'GUITAR_OK_01');

    const candsHub = queryCandidates({ category: 'ugreen_hub' });
    assert.equal(candsHub.length, 1);
    assert.equal(candsHub[0].item_id, 'HUB_OK_01');

    // purgeJunkCandidates runs cleanly without deleting legitimate items
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

    // Case 6: Digital price quote (110出 / 120包邮)
    const dialog6 = classifySellerCommunication({
      session: { contact_name: '拓展坞卖家', last_message: '110出', trade_status: '-' },
      messages: [
        { sender: 'Buyer', is_self: '是', content: '最低多少能出？' },
        { sender: '拓展坞卖家', is_self: '否', content: '110出' },
      ]
    });
    assert.equal(dialog6.status, 'responsive', 'Sub-4-digit digital price quote must be classified as responsive');

    // Case 7: Seller confirms stock with '在的，可以拍'
    const dialog7 = classifySellerCommunication({
      session: { contact_name: '现货卖家', last_message: '在的，随时可以拍，当天发', trade_status: '-' },
      messages: [
        { sender: 'Buyer', is_self: '是', content: '还有吗？' },
        { sender: '现货卖家', is_self: '否', content: '在的，随时可以拍，当天发' },
      ]
    });
    assert.equal(dialog7.status, 'responsive');

    // Case 8: Seller explicitly replies "不好意思，刚卖掉了"
    const dialog8 = classifySellerCommunication({
      session: { contact_name: '卖掉卖家', last_message: '不好意思，刚卖掉了', trade_status: '-' },
      messages: [
        { sender: 'Buyer', is_self: '是', content: '在吗' },
        { sender: '卖掉卖家', is_self: '否', content: '不好意思，刚卖掉了' },
      ]
    });
    assert.equal(dialog8.status, 'unfit', '卖掉了 must be classified as unfit');

    // Case 9: Seller explicitly replies "被人拍了" / "出给别人了"
    const dialog9 = classifySellerCommunication({
      session: { contact_name: '被拍卖家', last_message: '已经出给别人了，被人拍了', trade_status: '-' },
      messages: [
        { sender: 'Buyer', is_self: '是', content: '我要了' },
        { sender: '被拍卖家', is_self: '否', content: '已经出给别人了，被人拍了' },
      ]
    });
    assert.equal(dialog9.status, 'unfit', '被人拍了 / 出给别人了 must be classified as unfit');

    // Case 10: Seller answers defect inquiry with "没有暗病，成色很好可以拍" (MUST NOT be misclassified as unfit!)
    const dialog10 = classifySellerCommunication({
      session: { contact_name: '良品卖家', last_message: '没有暗病，成色很好可以拍', trade_status: '-' },
      messages: [
        { sender: 'Buyer', is_self: '是', content: '请问有暗病吗？' },
        { sender: '良品卖家', is_self: '否', content: '没有暗病，成色很好可以拍' },
      ]
    });
    assert.equal(dialog10.status, 'responsive', '没有暗病 must be classified as responsive, not unfit');

    // Case 11: Seller answers with "没有任何问题，包邮" (MUST NOT be misclassified as unfit!)
    const dialog11 = classifySellerCommunication({
      session: { contact_name: '正品卖家2', last_message: '没有任何问题，包邮', trade_status: '-' },
      messages: [
        { sender: 'Buyer', is_self: '是', content: '成色怎么样？有毛病吗？' },
        { sender: '正品卖家2', is_self: '否', content: '没有任何问题，包邮' },
      ]
    });
    assert.equal(dialog11.status, 'responsive', '没有任何问题 must be classified as responsive, not unfit');

    // Case 12: Seller replies "随时可拍，当天可发"
    const dialog12 = classifySellerCommunication({
      session: { contact_name: '极速发货', last_message: '随时可拍，当天可发', trade_status: '-' },
      messages: [
        { sender: 'Buyer', is_self: '是', content: '什么时候能发？' },
        { sender: '极速发货', is_self: '否', content: '随时可拍，当天可发' },
      ]
    });
    assert.equal(dialog12.status, 'responsive', '随时可拍当天可发 must be classified as responsive');

    // Case 13: Seller replies "都在，随时可以拍"
    const dialog13 = classifySellerCommunication({
      session: { contact_name: '库存充足', last_message: '都在，随时可以拍', trade_status: '-' },
      messages: [
        { sender: 'Buyer', is_self: '是', content: '东西还在吗' },
        { sender: '库存充足', is_self: '否', content: '都在，随时可以拍' },
      ]
    });
    assert.equal(dialog13.status, 'responsive', '都在随时可以拍 must be classified as responsive');

    // Case 14: Seller replies "东西都在，没有任何暗病"
    const dialog14 = classifySellerCommunication({
      session: { contact_name: '完好卖家', last_message: '东西都在，没有任何暗病', trade_status: '-' },
      messages: [
        { sender: 'Buyer', is_self: '是', content: '琴有问题吗' },
        { sender: '完好卖家', is_self: '否', content: '东西都在，没有任何暗病' },
      ]
    });
    assert.equal(dialog14.status, 'responsive', '没有任何暗病 must be classified as responsive, not unfit');
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

  await t.test('6. Objective Condition & Defect Inspection Notes Extraction', () => {
    // Flaw detection: scratches
    const note1 = extractDefectNotes('绿联9合1拓展坞', '成色9新，背面有些许划痕，功能一切正常');
    assert.ok(note1.includes('划痕'));
    assert.ok(note1.includes('⚠️ 检视注记'));

    // Flaw detection: bumps and missing parts
    const note2 = extractDefectNotes('恩雅智能吉他', '琴头有小磕碰，裸机无包装');
    assert.ok(note2.includes('小磕碰'));
    assert.ok(note2.includes('裸机'));

    // Pristine condition
    const note3 = extractDefectNotes('绿联 15375', '全新未拆封原封未拆，箱说全，顺丰包邮');
    assert.ok(note3.includes('全新未拆封'));
    assert.ok(note3.includes('✨ 成色良好'));

    // Empty / neutral description
    const note4 = extractDefectNotes('', '');
    assert.equal(note4, '封面完好待深检');

    // Negation protection: "无明显划痕，无明显磕碰，从没修过，箱说齐全" must NEVER flag defects!
    const note5 = extractDefectNotes('绿联 15375 拓展坞', '自用成色很好，无明显划痕，无明显磕碰，从没修过，箱说齐全');
    assert.ok(!note5.includes('⚠️ 检视注记'), 'Negated scratches/bumps must not produce defect warning');
    assert.ok(note5.includes('✨ 成色良好'), 'Flawless condition must be recognized as pristine');
    assert.ok(note5.includes('无明显划痕磕碰'), 'Must recognize pristine casing assertion');
    assert.ok(note5.includes('箱说配件全'), '箱说齐全 must be recognized as complete accessories');

    // Negation protection: "没有任何划痕，没有任何磕碰，从未拆修"
    const note6 = extractDefectNotes('恩雅 NEXG 2N 智能吉他', '成色99新，没有任何划痕，没有任何磕碰，从未拆修，配件齐全');
    assert.ok(!note6.includes('⚠️ 检视注记'), '没有任何划痕/磕碰 must not produce defect warning');
    assert.ok(note6.includes('✨ 成色良好'));
  });

  await t.test('7. Uncategorized Non-Guitar Candidates Retention in Purge', () => {
    // Candidate with 'other' or general category under ¥400 (e.g. ¥109 UGREEN Hub)
    saveCandidates([{
      item_id: 'OTHER_HUB_109',
      title: '绿联 15375 9合1 拓展坞 4K60Hz 千兆网口',
      price: '¥109',
      seller: '好卖家',
      category: 'ugreen_hub',
    }], { filterAccessories: false });

    // Ensure purge does NOT accidentally wipe valid sub-¥400 non-guitar products
    const purged = purgeJunkCandidates();
    assert.equal(purged, 0);

    const cands = queryCandidates({ category: 'ugreen_hub' });
    const found = cands.find(c => c.item_id === 'OTHER_HUB_109');
    assert.ok(found, 'Valid ¥109 UGREEN hub must be retained after purge');
  });

  await t.test('8. Price Range Boundaries in Candidate Queries', () => {
    saveCandidates([
      { item_id: 'PR_HUB_90', title: '绿联 15375 拓展坞 90', price: '¥90', category: 'ugreen_hub', seller: 'S1' },
      { item_id: 'PR_HUB_110', title: '绿联 15375 拓展坞 110', price: '¥110', category: 'ugreen_hub', seller: 'S2' },
      { item_id: 'PR_HUB_130', title: '绿联 15375 拓展坞 130', price: '¥130', category: 'ugreen_hub', seller: 'S3' },
      { item_id: 'PR_HUB_150', title: '绿联 15375 拓展坞 150', price: '¥150', category: 'ugreen_hub', seller: 'S4' },
    ], { filterAccessories: false });

    // String price boundary
    const res1 = queryCandidates({ category: 'ugreen_hub', minPrice: '100', maxPrice: '140' });
    const ids1 = res1.map(r => r.item_id);
    assert.ok(ids1.includes('PR_HUB_110'));
    assert.ok(ids1.includes('PR_HUB_130'));
    assert.ok(!ids1.includes('PR_HUB_90'));
    assert.ok(!ids1.includes('PR_HUB_150'));

    // Formatted currency boundary string (¥120)
    const res2 = queryCandidates({ category: 'ugreen_hub', maxPrice: '¥120' });
    const ids2 = res2.map(r => r.item_id);
    assert.ok(ids2.includes('PR_HUB_90'));
    assert.ok(ids2.includes('PR_HUB_110'));
    assert.ok(!ids2.includes('PR_HUB_130'));
    assert.ok(!ids2.includes('PR_HUB_150'));
  });

  await t.test('9. Category-Aware Condition and Defect Neutralization', () => {
    // 9a. Pristine condition on 3C digital hub must be recognized as 全新未拆封
    const hubPristine = extractMultiImageDefects('全新未拆封原封未拆，箱说全，包邮', ['https://img.alicdn.com/h1.jpg'], 'ugreen_hub');
    assert.equal(hubPristine.condition, '全新未拆封');
    assert.ok(hubPristine.defect_notes.includes('全新未拆封'));
    assert.ok(hubPristine.defect_notes.includes('箱说配件全'));

    // 9b. Non-guitar product with '无暗病' must NEVER produce '琴颈笔直'
    const hubDefect = extractMultiImageDefects('绿联 15375 9合1 拓展坞 功能全好无暗病', [], 'ugreen_hub');
    assert.ok(!hubDefect.defect_notes.includes('琴颈'), 'Hub defect notes must NOT mention guitar neck');
    assert.ok(hubDefect.defect_notes.includes('功能全好无暗病'));

    // 9c. Guitar product with '无暗病' properly recognizes neck condition
    const guitarDefect = extractMultiImageDefects('恩雅 NEXG 2N 智能吉他 琴颈笔直没有任何暗病', [], 'nexg2_nylon');
    assert.ok(guitarDefect.defect_notes.includes('琴颈笔直无暗病'));

    // 9d. Category inference handles various aliases
    assert.equal(inferCategory({ keyword: '绿联 9合1' }), 'ugreen_hub');
    assert.equal(inferCategory({ keyword: '绿联 15375 拓展坞' }), 'ugreen_hub');
    assert.equal(inferCategory({ category: '绿联' }), 'ugreen_hub');

    // 9e. Multi-image defect extraction on flawless item with negations ("无明显划痕，无明显磕碰，从没修过，箱说齐全")
    const hubFlawless = extractMultiImageDefects('自用成色很好，无明显划痕，无明显磕碰，从没修过，箱说齐全，包邮', ['https://img.alicdn.com/h2.jpg'], 'ugreen_hub');
    assert.equal(hubFlawless.condition, '95新(外观完好)', 'Flawless condition with negated scratches/bumps must not be downgraded to 85新');
    assert.ok(hubFlawless.defect_notes.includes('箱说配件全'), '箱说齐全 must be recognized as complete accessories in multi-image engine');
    assert.ok(!hubFlawless.defect_notes.includes('划痕'), 'Negated scratches must not produce scratch defect note');
    assert.ok(!hubFlawless.defect_notes.includes('磕碰'), 'Negated bumps must not produce bump defect note');

    // 9f. Cross-domain category inference boundary tests
    assert.equal(inferCategory({ title: '绿联 15375 9合1 拓展坞 尼龙编织线款' }), 'ugreen_hub', 'Nylon cable hub must not be misclassified as nylon guitar');
    assert.equal(inferCategory({ title: 'iPad Air 5 64G 蜂窝版' }), 'other', 'iPad Air must not be misclassified as LAVA ME Air guitar');
    assert.equal(inferCategory({ title: 'MacBook Air M2 16G 银色' }), 'other', 'MacBook Air must not be misclassified as LAVA ME Air guitar');
  });

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
