import test from 'node:test';
import assert from 'node:assert/strict';
import { 
  SCHEMA_CONTRACT, 
  generateDdl, 
  validateCandidate, 
  validateSellerReview, 
  validateOrder 
} from '../src/contract.js';

test('Contract-First Architecture & Type Safety', async (t) => {
  await t.test('SCHEMA_CONTRACT defines all required tables, views, and FTS tables', () => {
    const requiredTables = ['orders', 'favorites', 'sessions', 'messages', 'seller_reviews', 'candidates'];
    for (const tbl of requiredTables) {
      assert.ok(SCHEMA_CONTRACT.tables[tbl], `Table ${tbl} must be defined in SCHEMA_CONTRACT`);
      assert.ok(SCHEMA_CONTRACT.tables[tbl].primaryKey.length > 0, `Table ${tbl} must have primary key`);
    }

    assert.ok(SCHEMA_CONTRACT.views.candidates_view, 'candidates_view must be defined');
    assert.equal(SCHEMA_CONTRACT.fts.length, 3, 'Expected 3 FTS virtual tables');
  });

  await t.test('generateDdl produces valid SQL DDL statements matching contract', () => {
    const ddl = generateDdl();
    assert.ok(Array.isArray(ddl));
    assert.ok(ddl.length >= 10, 'Expected at least 10 DDL statements');

    const joinedDdl = ddl.join('\n\n');
    assert.ok(joinedDdl.includes('CREATE TABLE IF NOT EXISTS orders'));
    assert.ok(joinedDdl.includes('CREATE TABLE IF NOT EXISTS candidates'));
    assert.ok(joinedDdl.includes('CREATE TABLE IF NOT EXISTS seller_reviews'));
    assert.ok(joinedDdl.includes('CREATE VIRTUAL TABLE IF NOT EXISTS candidates_fts'));
    assert.ok(joinedDdl.includes('CREATE VIEW IF NOT EXISTS candidates_view'));
  });

  await t.test('validateCandidate enforces strict typing, normalization, and price parsing', () => {
    // Valid candidate
    const valid = validateCandidate({
      item_id: '12345678',
      title: '拿火 LAVA ME AIR 36寸黑色碳纤维',
      price: '¥1850.00',
      seller: '吉他小店',
      location: '广州',
    });

    assert.equal(valid.item_id, '12345678');
    assert.equal(valid.price_num, 1850);
    assert.equal(valid.price, '¥1850.00');
    assert.equal(valid.status, 'active');
    assert.ok(valid.item_url.includes('12345678'));

    // Supports multi-image and defect inspection notes
    const withDefect = validateCandidate({
      item_id: '998877',
      title: '商品',
      price: '100',
      images: 'https://img1.jpg | https://img2.jpg',
      defect_notes: '图2背面有划痕',
    });
    assert.equal(withDefect.images, 'https://img1.jpg | https://img2.jpg');
    assert.equal(withDefect.defect_notes, '图2背面有划痕');

    // Rejects missing item_id
    assert.throws(() => {
      validateCandidate({ title: '无ID商品', price: '¥100' });
    }, /item_id is required/);

    // Rejects missing title
    assert.throws(() => {
      validateCandidate({ item_id: '12345' });
    }, /title is required/);

    // Rejects non-object input
    assert.throws(() => {
      validateCandidate('invalid');
    }, TypeError);
  });

  await t.test('validateSellerReview enforces status enum and non-empty seller name', () => {
    const valid = validateSellerReview({
      seller: '雅趣琴音',
      status: 'responsive',
      reason: '现货在库且已报价',
      last_message: '现货1980',
    });

    assert.equal(valid.seller, '雅趣琴音');
    assert.equal(valid.status, 'responsive');
    assert.equal(valid.interaction_count, 1);

    // Invalid status rejected
    assert.throws(() => {
      validateSellerReview({ seller: '某卖家', status: 'fake_status' });
    }, /Invalid seller review status/);

    // Missing seller rejected
    assert.throws(() => {
      validateSellerReview({ status: 'responsive' });
    }, /Valid seller nickname is required/);
  });

  await t.test('validateOrder enforces required order_id', () => {
    const valid = validateOrder({
      order_id: 'ORD_999',
      title: '商品',
      price: '¥50',
    });
    assert.equal(valid.order_id, 'ORD_999');

    assert.throws(() => {
      validateOrder({ title: '无单号' });
    }, /Valid order_id is required/);
  });

  await t.test('isAccessoryTitle correctly detects pedals, cables, earphones, and parts', async () => {
    const { isAccessoryTitle } = await import('../src/contract.js');
    assert.equal(isAccessoryTitle('正泰超六类网线 NEXG-15034A 线芯0.57'), true);
    assert.equal(isAccessoryTitle('恩雅NEXG2无线控制踏板四键踩钉'), true);
    assert.equal(isAccessoryTitle('ENYA恩雅nexg2代专用耳机监听耳机'), true);
    assert.equal(isAccessoryTitle('拿火吉他原装琴包加厚双肩背包'), true);
    assert.equal(isAccessoryTitle('拿火LAVA ME Play智能吉他36寸', 'lava_me_air'), true);
    assert.equal(isAccessoryTitle('恩雅NEXG 2代古典版静音吉他尼龙弦自用闲置'), false);
    assert.equal(isAccessoryTitle('拿火LAVA ME air智能吉他 黑色碳纤维面板36寸'), false);
    assert.equal(isAccessoryTitle('拿火吉他四代 LAVA ME 4四代碳纤维智能吉他'), false);

    // 3C Digital Hub items and custom exclusion
    assert.equal(isAccessoryTitle('绿联 15375 Type-C扩展坞转千兆有线网口拓展坞', 'ugreen_hub'), false);
    assert.equal(isAccessoryTitle('绿联 15375 包装盒 空盒 出售', 'ugreen_hub'), true);
    assert.equal(isAccessoryTitle('绿联 6合1 扩展坞 4K30Hz 15375', 'ugreen_hub', ['6合1']), true);
  });

  await t.test('inferCategory normalizes category slugs and aliases', async () => {
    const { inferCategory } = await import('../src/contract.js');
    assert.equal(inferCategory({ keyword: 'nexg 2n' }), 'nexg2_nylon');
    assert.equal(inferCategory({ title: '恩雅 NEXG2 尼龙款静音吉他' }), 'nexg2_nylon');
    assert.equal(inferCategory({ keyword: 'lava me air' }), 'lava_me_air');
    assert.equal(inferCategory({ keyword: 'me4' }), 'lava_me_4');
    assert.equal(inferCategory({ keyword: 'lava 4' }), 'lava_me_4');
    assert.equal(inferCategory({ keyword: '绿联 15375' }), 'ugreen_hub');
    assert.equal(inferCategory({ keyword: 'macbook pro 16', category: 'laptop' }), 'laptop');
  });

  await t.test('classifySellerCommunication accurately attributes seller responses vs buyer questions', async () => {
    const { classifySellerCommunication } = await import('../src/contract.js');

    // Case 1: Buyer asked "请问有没有现货？", seller replied "有的，全新现货1980包邮发货"
    const responsiveCase = classifySellerCommunication({
      session: { contact_name: '正品吉他行', trade_status: '-', last_message: '有的，全新现货1980包邮发货' },
      messages: [
        { is_self: '是', content: '请问有没有现货？有没有瑕疵？' },
        { is_self: '否', content: '有的，全新现货1980包邮发货' }
      ]
    });
    assert.equal(responsiveCase.status, 'responsive');
    assert.ok(responsiveCase.reason.includes('活跃报价'));

    // Case 2: Buyer asked, seller explicitly replied "没有"
    const unfitCase = classifySellerCommunication({
      session: { contact_name: '倒爷琴行', trade_status: '-', last_message: '没有' },
      messages: [
        { is_self: '是', content: 'nexg2n还在吗？' },
        { is_self: '否', content: '没有' }
      ]
    });
    assert.equal(unfitCase.status, 'unfit');
    assert.ok(unfitCase.reason.includes('明确无货'));

    // Case 3: Buyer asked, seller only replied with automated greeting
    const ghostedCase = classifySellerCommunication({
      session: { contact_name: '慢半拍', trade_status: '-', last_message: '自动回复：客服在忙请稍候' },
      messages: [
        { is_self: '是', content: '请问最低多少能出？' },
        { is_self: '否', content: '自动回复：客服在忙请稍候' }
      ]
    });
    assert.equal(ghostedCase.status, 'ghosted');

    // Case 4: Trade closed
    const closedCase = classifySellerCommunication({
      session: { contact_name: '某卖家', trade_status: '交易关闭', last_message: '[卖家关闭了订单]' },
      messages: []
    });
    assert.equal(closedCase.status, 'unfit');
  });
});
