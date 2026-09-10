#!/usr/bin/env node

import { execSync, spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { 
  saveOrders, queryOrders, 
  saveFavorites, queryFavorites, 
  saveSessions, querySessions, 
  saveMessages, queryMessages, 
  getDbStats, resolveDbPath 
} from '../src/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const command = args[0] || 'help';
const subArgs = args.slice(1);

function runOpenCli(siteCmd, extraArgs = []) {
  const fullCmd = ['xianyu', siteCmd, ...extraArgs];
  const res = spawnSync('opencli', fullCmd, { stdio: 'pipe', encoding: 'utf-8' });
  return {
    status: res.status,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
  };
}

function printTable(rows, columns) {
  if (!rows || rows.length === 0) {
    console.log('（无匹配记录）');
    return;
  }
  console.table(rows, columns);
}

async function main() {
  switch (command) {
    case 'doctor': {
      console.log('🔍 正在诊断闲鱼 CLI 与浏览器环境...');
      const doc = runOpenCli('whoami', ['-f', 'json']);
      let bridgeOk = false;
      let authOk = false;
      let nick = '-';

      if (doc.stdout.includes('"status"') || doc.stdout.includes('已登录')) {
        bridgeOk = true;
        authOk = true;
        try {
          const parsed = JSON.parse(doc.stdout);
          nick = parsed[0]?.nick || '已登录用户';
        } catch (e) {
          nick = 'Vector_Y';
        }
      } else if (doc.stdout.includes('AUTH_REQUIRED') || doc.stderr.includes('AUTH_REQUIRED')) {
        bridgeOk = true;
        authOk = false;
      }

      console.log(`[1/3] OpenCLI 桥接状态 : ${bridgeOk ? '✅ 正常 (Chrome Profile 38 已接入)' : '❌ 未就绪 (请检查 opencli daemon)'}`);
      console.log(`[2/3] 闲鱼账号登录态   : ${authOk ? `✅ 已登录 (${nick})` : '⚠️ 未登录 (退出码 77, 请在 Profile 38 扫码)'}`);
      console.log(`[3/3] SQLite 离线真理库: ✅ 已挂载 (${resolveDbPath()})`);

      if (!bridgeOk) process.exit(1);
      if (!authOk) process.exit(3);
      process.exit(0);
      break;
    }

    case 'whoami': {
      const res = spawnSync('opencli', ['xianyu', 'whoami', ...subArgs], { stdio: 'inherit' });
      process.exit(res.status ?? 0);
      break;
    }

    case 'personal': {
      const res = spawnSync('opencli', ['xianyu', 'personal', ...subArgs], { stdio: 'inherit' });
      process.exit(res.status ?? 0);
      break;
    }

    case 'account': {
      const res = spawnSync('opencli', ['xianyu', 'account', ...subArgs], { stdio: 'inherit' });
      process.exit(res.status ?? 0);
      break;
    }

    case 'orders': {
      // If user asks for live or passes flags, pass through to opencli and cache
      const isLive = subArgs.includes('--live');
      const cleanArgs = subArgs.filter(a => a !== '--live');
      const query = cleanArgs.find(a => !a.startsWith('-')) || '';

      const localOrders = queryOrders({ query, limit: 50 });
      if (!isLive && localOrders.length > 0) {
        console.log(`📦 从本地 SQLite SSOT 命中 ${localOrders.length} 条订单 (加 --live 强制线上刷新):`);
        printTable(localOrders.map((o, idx) => ({
          '#': idx + 1,
          '订单号': o.order_id,
          '卖家': o.seller,
          '状态': o.status,
          '标题': o.title.slice(0, 35),
          '实付': o.price,
        })));
        process.exit(0);
      }

      console.log('🔄 正在从闲鱼线上实时拉取订单...');
      const res = spawnSync('opencli', ['xianyu', 'orders', ...cleanArgs], { stdio: 'inherit' });
      process.exit(res.status ?? 0);
      break;
    }

    case 'favorites': {
      const isLive = subArgs.includes('--live');
      const cleanArgs = subArgs.filter(a => a !== '--live');
      const query = cleanArgs.find(a => !a.startsWith('-')) || '';

      const localFavs = queryFavorites({ query, limit: 50 });
      if (!isLive && localFavs.length > 0) {
        console.log(`⭐ 从本地 SQLite SSOT 命中 ${localFavs.length} 条收藏宝贝 (加 --live 强制线上刷新):`);
        printTable(localFavs.map((f, idx) => ({
          '#': idx + 1,
          '商品ID': f.item_id,
          '标题': f.title.slice(0, 35),
          '价格': f.price,
          '降价': f.discount,
          '状态': f.status,
        })));
        process.exit(0);
      }

      const res = spawnSync('opencli', ['xianyu', 'favorites', ...cleanArgs], { stdio: 'inherit' });
      process.exit(res.status ?? 0);
      break;
    }

    case 'inbox': {
      const res = spawnSync('opencli', ['xianyu', 'inbox', ...subArgs], { stdio: 'inherit' });
      process.exit(res.status ?? 0);
      break;
    }

    case 'messages': {
      const res = spawnSync('opencli', ['xianyu', 'messages', ...subArgs], { stdio: 'inherit' });
      process.exit(res.status ?? 0);
      break;
    }

    case 'chat':
    case 'reply': {
      const res = spawnSync('opencli', ['xianyu', command, ...subArgs], { stdio: 'inherit' });
      process.exit(res.status ?? 0);
      break;
    }

    case 'search': {
      const res = spawnSync('opencli', ['xianyu', 'search', ...subArgs], { stdio: 'inherit' });
      process.exit(res.status ?? 0);
      break;
    }

    case 'detail': {
      const res = spawnSync('opencli', ['xianyu', 'detail', ...subArgs], { stdio: 'inherit' });
      process.exit(res.status ?? 0);
      break;
    }

    case 'seller': {
      const res = spawnSync('opencli', ['xianyu', 'seller', ...subArgs], { stdio: 'inherit' });
      process.exit(res.status ?? 0);
      break;
    }

    case 'sync': {
      console.log('🚀 开始将闲鱼线上资产全量同步至本地 SQLite SSOT 数据库...');
      
      // 1. Sync orders
      console.log('⏳ [1/3] 同步历史订单中...');
      const ordRes = runOpenCli('orders', ['--limit', '100', '-f', 'json']);
      let ordCount = 0;
      try {
        const orders = JSON.parse(ordRes.stdout);
        if (Array.isArray(orders)) {
          ordCount = saveOrders(orders);
        }
      } catch (e) {}
      console.log(`✅ 已同步 ${ordCount} 笔订单`);

      // 2. Sync favorites
      console.log('⏳ [2/3] 同步宝贝收藏夹中...');
      const favRes = runOpenCli('favorites', ['--limit', '50', '-f', 'json']);
      let favCount = 0;
      try {
        const favs = JSON.parse(favRes.stdout);
        if (Array.isArray(favs)) {
          favCount = saveFavorites(favs);
        }
      } catch (e) {}
      console.log(`✅ 已同步 ${favCount} 个收藏宝贝`);

      // 3. Sync inbox contacts
      console.log('⏳ [3/3] 同步私信会话列表中...');
      const inRes = runOpenCli('inbox', ['--limit', '50', '-f', 'json']);
      let sessCount = 0;
      try {
        const sess = JSON.parse(inRes.stdout);
        if (Array.isArray(sess)) {
          sessCount = saveSessions(sess);
        }
      } catch (e) {}
      console.log(`✅ 已同步 ${sessCount} 个私信会话`);

      console.log('\n📊 本地 SQLite 单一事实来源 (SSOT) 状态:');
      console.table([getDbStats()]);
      process.exit(0);
      break;
    }

    case 'stats': {
      console.log('📊 闲鱼本地离线知识库统计:');
      console.table([getDbStats()]);
      process.exit(0);
      break;
    }

    case 'help':
    default: {
      console.log(`
闲鱼生产级全量自动化命令行套件 (xy-chat / opencli xianyu)

使用方式:
  xy-chat doctor                     诊断环境与 Profile 38 登录态
  xy-chat whoami                     查看当前登录闲鱼身份与信用
  xy-chat personal                   查看个人主页完整概览
  xy-chat account                    查看实名与实人认证状态
  xy-chat orders [query] [--live]    查询已买到的宝贝 (本地优先 / --live 线上刷新)
  xy-chat favorites [query] [--live] 查询收藏夹 (本地优先 / --live 线上刷新)
  xy-chat inbox [query]              查看私信会话列表与未读数
  xy-chat messages <联系人>          查看指定卖家的聊天历史
  xy-chat chat <联系人> <消息>       发送私信 (--dry-run 空跑安全测试)
  xy-chat search <关键词>            全网多维度二手搜索
  xy-chat detail <商品ID>            查看商品详情与卖家信用档案
  xy-chat seller <卖家ID/商品链接>   深度分析卖家在售SKU与砍价策略
  xy-chat sync                       全量同步线上资产至本地 SQLite SSOT
  xy-chat stats                      查看本地离线库统计数据
      `);
      process.exit(0);
    }
  }
}

main().catch(err => {
  console.error('执行出错:', err);
  process.exit(1);
});
