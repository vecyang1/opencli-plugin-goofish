import test from 'node:test';
import assert from 'node:assert/strict';
import { 
  validateMonitoringTask, 
  validatePriceHistoryRecord, 
  computePriceHistoryStats 
} from '../clis/goofish/_contract.js';
import { 
  saveMonitoringTask, 
  queryMonitoringTasks, 
  getMonitoringTask, 
  updateMonitoringTask, 
  deleteMonitoringTask,
  recordPriceHistory,
  queryPriceHistory,
  getPriceHistorySummary,
  getDb
} from '../clis/goofish/_db.js';

test('Price Tracking & Low-Price Snipe Engine Test Suite', async (t) => {
  await t.test('1. validateMonitoringTask enforces schema, defaults, and type normalization', () => {
    // Basic valid task
    const task = validateMonitoringTask({
      keyword: 'nexg 2n 尼龙',
      target_price: '1600',
      max_price: '2500',
    });

    assert.equal(task.keyword, 'nexg 2n 尼龙');
    assert.equal(task.category, 'nexg2_nylon');
    assert.equal(task.target_price, 1600);
    assert.equal(task.max_price, 2500);
    assert.equal(task.price_floor, 700); // inferred from nexg2_nylon product spec
    assert.equal(task.status, 'active');
    assert.ok(task.task_id.startsWith('task_'));

    // Rejection on missing keyword
    assert.throws(() => validateMonitoringTask({ keyword: '' }), /必须指定搜索关键词/);
    assert.throws(() => validateMonitoringTask(null), /必须是非空对象/);
  });

  await t.test('2. validatePriceHistoryRecord standardizes price and listing metadata', () => {
    const record = validatePriceHistoryRecord({
      item_id: '10889922',
      keyword: 'nexg 2n',
      category: 'nexg2_nylon',
      title: '恩雅 NEXG 2N 黑色 尼龙款 95新全套',
      price: '¥1450.00',
      seller: '吉他转让',
      defect_notes: '成色极佳，无划痕',
    });

    assert.equal(record.item_id, '10889922');
    assert.equal(record.price_num, 1450);
    assert.equal(record.price, '¥1450.00');
    assert.equal(record.status, 'active');
    assert.ok(record.item_url.includes('10889922'));

    // Rejection on missing item_id
    assert.throws(() => validatePriceHistoryRecord({ title: '无ID' }), /有效商品ID/);
  });

  await t.test('3. computePriceHistoryStats calculates floor, median, distribution, and low-price spikes', () => {
    const mockRecords = [
      { price_num: 1950, is_below_target: 0 },
      { price_num: 1899, is_below_target: 0 },
      { price_num: 1920, is_below_target: 0 },
      { price_num: 1450, is_below_target: 1 }, // Low-price spike!
      { price_num: 1850, is_below_target: 0 },
      { price_num: 1550, is_below_target: 1 }, // Second low-price spike
    ];

    const stats = computePriceHistoryStats(mockRecords, 1600);
    assert.equal(stats.count, 6);
    assert.equal(stats.lowestPrice, 1450);
    assert.equal(stats.highestPrice, 1950);
    assert.equal(stats.belowTargetCount, 2);
    assert.ok(stats.averagePrice > 1700 && stats.averagePrice < 1800);
    assert.ok(stats.medianPrice >= 1850);
    assert.equal(stats.recentSpikes.length, 2);
    assert.ok(stats.priceDistribution.tier1_bargain >= 2);
  });

  await t.test('4. SQLite SSOT CRUD for monitoring_tasks with real data roundtrip', () => {
    const testTaskId = `test_nexg2n_${Date.now()}`;
    const task = saveMonitoringTask({
      task_id: testTaskId,
      keyword: 'nexg 2n 尼龙',
      category: 'nexg2_nylon',
      target_price: 1650,
      price_floor: 700,
      require_keywords: '尼龙,2N',
      exclude_keywords: '钢弦',
      status: 'active',
      notes: '测试监控任务',
    });

    assert.equal(task.task_id, testTaskId);

    // Read back from SQLite
    const retrieved = getMonitoringTask(testTaskId);
    assert.ok(retrieved);
    assert.equal(retrieved.keyword, 'nexg 2n 尼龙');
    assert.equal(retrieved.target_price, 1650);
    assert.equal(retrieved.status, 'active');

    // Update task
    const updated = updateMonitoringTask(testTaskId, {
      target_price: 1580,
      status: 'paused',
      notes: '更新价格门槛',
    });
    assert.equal(updated.target_price, 1580);
    assert.equal(updated.status, 'paused');
    assert.equal(updated.notes, '更新价格门槛');

    // Query list
    const list = queryMonitoringTasks({ keyword: 'nexg 2n' });
    assert.ok(list.length > 0);
    assert.ok(list.some(t => t.task_id === testTaskId));

    // Delete task
    const deleted = deleteMonitoringTask(testTaskId);
    assert.equal(deleted, true);
    assert.equal(getMonitoringTask(testTaskId), null);
  });

  await t.test('5. recordPriceHistory and automatic task alert reconciliation', () => {
    const testTaskId = `task_recon_${Date.now()}`;
    saveMonitoringTask({
      task_id: testTaskId,
      keyword: 'nexg 2n 尼龙',
      category: 'nexg2_nylon',
      target_price: 1600,
      status: 'active',
    });

    const items = [
      {
        item_id: '10998811',
        title: '恩雅 NEXG 2N 黑色 尼龙',
        price: '¥1920',
        price_num: 1920,
        seller: '琴行',
        item_url: 'https://www.goofish.com/item?id=10998811',
      },
      {
        item_id: '10998822',
        title: '恩雅 NEXG 2N 黑色 尼龙 捡漏急出',
        price: '¥1480',
        price_num: 1480, // Below target price 1600!
        seller: '个人自用',
        item_url: 'https://www.goofish.com/item?id=10998822',
      },
    ];

    const inserted = recordPriceHistory(items, {
      task_id: testTaskId,
      keyword: 'nexg 2n 尼龙',
      category: 'nexg2_nylon',
      target_price: 1600,
    });

    assert.equal(inserted, 2);

    // Verify task reconciliation
    const taskAfter = getMonitoringTask(testTaskId);
    assert.ok(taskAfter);
    assert.equal(taskAfter.current_low_price, 1480);
    assert.equal(taskAfter.historical_low_price, 1480);
    assert.equal(taskAfter.historical_low_item_id, '10998822');
    assert.equal(taskAfter.status, 'alerting'); // Automatic transition to alerting!
    assert.equal(taskAfter.below_target_count, 1);
    assert.equal(taskAfter.total_spotted_count, 2);

    // Query price history
    const history = queryPriceHistory({ task_id: testTaskId });
    assert.equal(history.length, 2);
    const belowTargetItems = queryPriceHistory({ task_id: testTaskId, is_below_target: true });
    assert.equal(belowTargetItems.length, 1);
    assert.equal(belowTargetItems[0].price_num, 1480);

    // Cleanup
    deleteMonitoringTask(testTaskId);
  });
});
