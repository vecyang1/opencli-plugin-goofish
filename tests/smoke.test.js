import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clisDir = path.resolve(__dirname, '../clis/goofish');

const expectedFiles = [
  'whoami.js', 'personal.js', 'account.js', 'stats.js',
  'orders.js', 'favorites.js', 'published.js', 'search.js',
  'detail.js', 'inbox.js', 'messages.js', 'chat.js',
  'reply.js', 'reason.js', 'export.js'
];

test('all expected CLI command files exist', () => {
  for (const file of expectedFiles) {
    const filePath = path.join(clisDir, file);
    assert.strictEqual(fs.existsSync(filePath), true, `File missing: ${file}`);
  }
});

test('all CLI command files contain valid OpenCLI structure and non-empty columns', () => {
  const files = fs.readdirSync(clisDir).filter(f => f.endsWith('.js'));
  assert.ok(files.length >= 14, `Expected at least 14 commands, found ${files.length}`);

  for (const file of files) {
    const content = fs.readFileSync(path.join(clisDir, file), 'utf-8');
    
    assert.ok(content.includes("import { cli"), `${file} missing cli import`);
    assert.ok(content.includes("export const command = cli({"), `${file} missing export const command = cli({`);
    assert.ok(content.includes("columns: ["), `${file} missing columns definition`);
    assert.ok(content.includes("func: async"), `${file} missing async execution func`);
    
    // Extract columns
    const match = content.match(/columns:\s*\[([\s\S]*?)\]/);
    assert.ok(match, `${file} columns block not matched`);
    const cols = match[1].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean);
    assert.ok(cols.length > 0, `${file} has 0 columns declared`);
  }
});
