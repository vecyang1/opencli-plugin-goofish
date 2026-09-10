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
});
