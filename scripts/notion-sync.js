#!/usr/bin/env node

/**
 * CLI runner for Goofish Notion Database Sync
 * Usage:
 *   node scripts/notion-sync.js
 *   node scripts/notion-sync.js --parent <page_id>
 *   node scripts/notion-sync.js --db <database_id>
 */

import { syncWithNotion } from '../src/notion-sync.js';

const args = process.argv.slice(2);
const options = {};

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--db' && args[i + 1]) {
    options.databaseId = args[i + 1];
    i++;
  } else if (args[i] === '--parent' && args[i + 1]) {
    options.parentPageId = args[i + 1];
    i++;
  }
}

console.log('🔄 正在执行闲鱼低价监控与 Notion 数据库双向对账同步...');

syncWithNotion(options)
  .then(res => {
    console.log('✅ Notion 同步完成！');
    console.log(`📋 Notion 数据库链接: ${res.notion_url}`);
    console.log(`⬇️ 从 Notion 拉回人工修改: ${res.pulled_from_notion} 条`);
    console.log(`⬆️ 新推送到 Notion: ${res.pushed_new_to_notion} 个任务`);
    console.log(`🔄 更新 Notion 任务指标: ${res.updated_in_notion} 个任务`);
    console.log(`⏱️ 耗时: ${res.duration_ms}ms (${res.synced_at})`);
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Notion 同步失败:', err.message);
    process.exit(1);
  });
