import test from 'node:test';
import assert from 'node:assert/strict';
import { createDashboardServer } from '../src/server.js';
import { getMonitoringTask, deleteMonitoringTask } from '../clis/goofish/_db.js';

test('Web Operations Dashboard Server & REST API Test Suite', async (t) => {
  const dashboard = createDashboardServer();
  const addr = await dashboard.listen(3999, '127.0.0.1');
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  let createdTaskId = null;

  t.after(async () => {
    if (createdTaskId) {
      deleteMonitoringTask(createdTaskId);
    }
    await dashboard.close();
  });

  await t.test('1. Static File Serving: index.html, styles.css, app.js', async () => {
    const resHtml = await fetch(`${baseUrl}/`);
    assert.equal(resHtml.status, 200);
    assert.equal(resHtml.headers.get('content-type'), 'text/html; charset=utf-8');
    const html = await resHtml.text();
    assert.ok(html.includes('闲鱼低价监控与捡漏中控台'));

    const resCss = await fetch(`${baseUrl}/styles.css`);
    assert.equal(resCss.status, 200);
    assert.equal(resCss.headers.get('content-type'), 'text/css; charset=utf-8');

    const resJs = await fetch(`${baseUrl}/app.js`);
    assert.equal(resJs.status, 200);
    assert.equal(resJs.headers.get('content-type'), 'application/javascript; charset=utf-8');
  });

  await t.test('2. REST API: GET /api/stats returns authoritative metrics', async () => {
    const res = await fetch(`${baseUrl}/api/stats`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(typeof data.stats.total_tasks === 'number');
    assert.ok(typeof data.stats.candidates_stored === 'number');
  });

  await t.test('3. REST API: POST /api/tasks creates task with validation and DB persistence', async () => {
    const payload = {
      keyword: 'nexg 2n 尼龙 测试任务',
      category: 'nexg2_nylon',
      target_price: 1650,
      price_floor: 700,
      max_price: 2000,
      require_keywords: '2N,尼龙',
      exclude_keywords: '配件,琴包',
      interval_sec: 1800,
      notes: '自动化测试任务',
      status: 'active',
    };

    const res = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.task.task_id);
    createdTaskId = data.task.task_id;

    // Verify persisted directly in SQLite SSOT
    const dbTask = getMonitoringTask(createdTaskId);
    assert.ok(dbTask);
    assert.equal(dbTask.keyword, 'nexg 2n 尼龙 测试任务');
    assert.equal(dbTask.target_price, 1650);
    assert.equal(dbTask.status, 'active');
  });

  await t.test('4. REST API: GET /api/tasks lists tasks and supports filters', async () => {
    const res = await fetch(`${baseUrl}/api/tasks?status=active`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(Array.isArray(data.tasks));
    const found = data.tasks.find(t => t.task_id === createdTaskId);
    assert.ok(found);
  });

  await t.test('5. REST API: PATCH /api/tasks/:id updates task status (Pause/Resume)', async () => {
    const res = await fetch(`${baseUrl}/api/tasks/${encodeURIComponent(createdTaskId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'paused', notes: '已暂停更新' }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.task.status, 'paused');
    assert.equal(data.task.notes, '已暂停更新');

    const check = getMonitoringTask(createdTaskId);
    assert.equal(check.status, 'paused');
  });

  await t.test('6. REST API: POST /api/tasks/:id/scan triggers scan check', async () => {
    const res = await fetch(`${baseUrl}/api/tasks/${encodeURIComponent(createdTaskId)}/scan`, {
      method: 'POST',
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.scan_summary);
    assert.ok(data.task.last_checked_at);
  });

  await t.test('7. REST API: POST /api/diagnose runs two-sided inspection pipeline', async () => {
    // 7.1 Positive Bargain Case: NEXG 2N below target price
    const posRes = await fetch(`${baseUrl}/api/diagnose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: '恩雅 NEXG 2N 静音智能吉他 尼龙款 黑色 99新',
        price: 1550,
        category: 'nexg2_nylon',
        target_price: 1600,
        exclude: '配件,琴包',
        require: '2N,尼龙',
      }),
    });
    assert.equal(posRes.status, 200);
    const posData = await posRes.json();
    assert.equal(posData.success, true);
    assert.equal(posData.verdict, 'TRIGGER_ALERT');
    assert.equal(posData.verdict_badge, '🚨 触发低价捡漏告警');
    assert.equal(posData.trace.length, 4);
    assert.equal(posData.trace[0].passed, true); // Passed accessory filter

    // 7.2 Negative Case: Accessory junk
    const negRes = await fetch(`${baseUrl}/api/diagnose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: '恩雅 NEXG 2 代 专用琴包 双肩吉他包 配件',
        price: 120,
        category: 'nexg2_nylon',
        target_price: 1600,
      }),
    });
    assert.equal(negRes.status, 200);
    const negData = await negRes.json();
    assert.equal(negData.success, true);
    assert.equal(negData.verdict, 'REJECT_ACCESSORY');
    assert.equal(negData.trace[0].passed, false); // Failed accessory filter
  });

  await t.test('8. REST API: GET /api/rules and GET /api/history', async () => {
    const rulesRes = await fetch(`${baseUrl}/api/rules`);
    assert.equal(rulesRes.status, 200);
    const rulesData = await rulesRes.json();
    assert.equal(rulesData.success, true);
    assert.ok(rulesData.catalog.some(c => c.id === 'nexg2_nylon'));

    const histRes = await fetch(`${baseUrl}/api/history?keyword=nexg&limit=10`);
    assert.equal(histRes.status, 200);
    const histData = await histRes.json();
    assert.equal(histData.success, true);
    assert.ok(histData.summary);
  });

  await t.test('9. REST API: DELETE /api/tasks/:id deletes task cleanly', async () => {
    const res = await fetch(`${baseUrl}/api/tasks/${encodeURIComponent(createdTaskId)}`, {
      method: 'DELETE',
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);

    const check = getMonitoringTask(createdTaskId);
    assert.equal(check, null);
    createdTaskId = null; // Cleaned up
  });
});
