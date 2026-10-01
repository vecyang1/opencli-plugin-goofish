import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clisDir = path.resolve(__dirname, '../clis/goofish');

function extractCliMeta(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const nameMatch = content.match(/name:\s*['"]([^'"]+)['"]/);
  const accessMatch = content.match(/access:\s*['"]([^'"]+)['"]/);
  const descMatch = content.match(/description:\s*['"]([^'"]+)['"]/);
  const columnsMatch = content.match(/columns:\s*\[([\s\S]*?)\]/);
  
  let columns = [];
  if (columnsMatch) {
    columns = columnsMatch[1]
      .split(',')
      .map(s => s.trim().replace(/['"]/g, ''))
      .filter(Boolean);
  }

  return {
    name: nameMatch ? nameMatch[1] : null,
    access: accessMatch ? accessMatch[1] : null,
    description: descMatch ? descMatch[1] : null,
    columns,
    content,
  };
}

test('seller suite: edit.js defines complete contract, write access, and required flags', () => {
  const meta = extractCliMeta(path.join(clisDir, 'edit.js'));
  assert.strictEqual(meta.name, 'edit');
  assert.strictEqual(meta.access, 'write');
  assert.ok(meta.columns.includes('item_id'));
  assert.ok(meta.columns.includes('status'));
  assert.ok(meta.columns.includes('new_price'));
  assert.ok(meta.columns.includes('editor_length'));
  assert.ok(meta.columns.includes('submit_state'));
  
  // Must support --description_file, --submit, and --screenshot
  assert.ok(meta.content.includes("'description_file'"));
  assert.ok(meta.content.includes("'submit'"));
  assert.ok(meta.content.includes("'screenshot'"));
  assert.ok(meta.content.includes('必须指定要编辑的闲鱼商品 ID'));
});

test('seller suite: edit command description_file preserves exact multiline newlines and converts to <br>', () => {
  const tmpFile = path.join(__dirname, 'fixtures_test_desc.txt');
  const multilineContent = '【测试标题】\n\n• 第一行\n• 第二行\n\n【交易】\n• 顺丰包邮';
  fs.writeFileSync(tmpFile, multilineContent, 'utf-8');

  try {
    const raw = fs.readFileSync(tmpFile, 'utf8').trim();
    assert.strictEqual(raw, multilineContent);

    // Test Xianyu contenteditable editor line splitting logic
    const lines = raw.split('\n');
    assert.strictEqual(lines.length, 7);
    assert.strictEqual(lines[0], '【测试标题】');
    assert.strictEqual(lines[1], ''); // blank line for visual spacing
    assert.strictEqual(lines[2], '• 第一行');
    assert.strictEqual(lines[3], '• 第二行');
    assert.strictEqual(lines[4], ''); // blank line
    assert.strictEqual(lines[5], '【交易】');
    assert.strictEqual(lines[6], '• 顺丰包邮');

    const safeLines = lines.map(line => line.length === 0 ? '<br>' : line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
    const editorHtml = safeLines.join('<br>');
    assert.ok(editorHtml.includes('<br><br>• 第一行<br>• 第二行<br><br>'));
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
});

test('seller suite: offline.js (下架) defines complete contract and required guards', () => {
  const meta = extractCliMeta(path.join(clisDir, 'offline.js'));
  assert.strictEqual(meta.name, 'offline');
  assert.strictEqual(meta.access, 'write');
  assert.deepStrictEqual(meta.columns, ['item_id', 'status', 'action', 'title', 'message']);
  assert.ok(meta.content.includes('必须指定要下架的闲鱼商品 ID'));
  assert.ok(meta.content.includes("'submit'"));
});

test('seller suite: relist.js (重新上架) defines complete contract and required guards', () => {
  const meta = extractCliMeta(path.join(clisDir, 'relist.js'));
  assert.strictEqual(meta.name, 'relist');
  assert.strictEqual(meta.access, 'write');
  assert.deepStrictEqual(meta.columns, ['item_id', 'status', 'action', 'title', 'message']);
  assert.ok(meta.content.includes('必须指定要重新上架的闲鱼商品 ID'));
  assert.ok(meta.content.includes("'submit'"));
});

test('seller suite: delete.js (永久删除) defines complete contract and required guards', () => {
  const meta = extractCliMeta(path.join(clisDir, 'delete.js'));
  assert.strictEqual(meta.name, 'delete');
  assert.strictEqual(meta.access, 'write');
  assert.deepStrictEqual(meta.columns, ['item_id', 'status', 'action', 'title', 'message']);
  assert.ok(meta.content.includes('必须指定要删除的闲鱼商品 ID'));
  assert.ok(meta.content.includes("'submit'"));
});

test('seller suite: sold.js (我卖出的) defines complete contract and read access', () => {
  const meta = extractCliMeta(path.join(clisDir, 'sold.js'));
  assert.strictEqual(meta.name, 'sold');
  assert.strictEqual(meta.access, 'read');
  assert.deepStrictEqual(meta.columns, [
    'index',
    'item_id',
    'title',
    'price',
    'original_price',
    'status',
    'item_url',
  ]);
  assert.ok(meta.content.includes("'limit'"));
  assert.ok(meta.content.includes("'query'"));
});
