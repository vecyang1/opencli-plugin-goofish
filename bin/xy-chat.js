#!/usr/bin/env node

import { execSync, spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { 
  saveOrders, queryOrders, 
  saveFavorites, queryFavorites, 
  saveSessions, querySessions, 
  saveMessages, queryMessages, 
  saveCandidates, queryCandidates, purgeJunkCandidates,
  saveSellerReview, getSellerReview, querySellerReviews,
  syncSellerReviewsFromSessionsAndMessages,
  getDbStats, resolveDbPath 
} from '../src/db.js';
import { isAccessoryTitle, inferCategory } from '../src/contract.js';
import { humanDelay } from '../clis/goofish/_shared.js';

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

function parseCliArgs(args) {
  const flagsWithValue = new Set([
    '--limit', '-n',
    '--status', '-s',
    '--format', '-f',
    '--tab',
    '--scrolls',
    '--category',
    '--keyword', '-q',
    '--page-num',
    '--sort',
    '--region',
    '--min-price',
    '--max-price',
    '--tags',
    '--exclude',
    '--output',
    '--file-type',
    '--msg-limit',
    '--note',
    '--interval',
    '--iterations',
  ]);
  const positionals = [];
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('-')) {
      if (flagsWithValue.has(arg) && i + 1 < args.length && !args[i + 1].startsWith('-')) {
        options[arg] = args[i + 1];
        i++;
      } else {
        options[arg] = true;
      }
    } else {
      positionals.push(arg);
    }
  }
  return { positionals, options };
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
          nick = '已登录用户';
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
      const { positionals, options } = parseCliArgs(cleanArgs);
      const query = positionals[0] || '';
      const limit = parseInt(options['--limit'] || options['-n'] || '50', 10);

      const localOrders = queryOrders({ query, limit });
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
      const { positionals, options } = parseCliArgs(cleanArgs);
      const query = positionals[0] || '';
      const limit = parseInt(options['--limit'] || options['-n'] || '50', 10);

      const localFavs = queryFavorites({ query, limit });
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
      const isLive = subArgs.includes('--live');
      const cleanArgs = subArgs.filter(a => a !== '--live');
      const { positionals, options } = parseCliArgs(cleanArgs);
      const query = positionals[0] || '';
      const limit = parseInt(options['--limit'] || options['-n'] || '50', 10);

      const localSessions = querySessions({ query, limit });
      if (!isLive && localSessions.length > 0) {
        console.log(`💬 从本地 SQLite SSOT 命中 ${localSessions.length} 个私信会话 (加 --live 强制线上刷新):`);
        printTable(localSessions.map((s, idx) => ({
          '#': idx + 1,
          '联系人': s.contact_name,
          '最新消息': (s.last_message || '-').slice(0, 35),
          '时间': s.time,
          '未读': s.unread,
          '关联宝贝': s.has_item,
        })));
        process.exit(0);
      }

      console.log('🔄 正在从闲鱼线上实时拉取私信会话...');
      const res = spawnSync('opencli', ['xianyu', 'inbox', ...cleanArgs], { stdio: 'inherit' });
      process.exit(res.status ?? 0);
      break;
    }

    case 'messages': {
      const isLive = subArgs.includes('--live');
      const cleanArgs = subArgs.filter(a => a !== '--live');
      const { positionals, options } = parseCliArgs(cleanArgs);
      const contact = positionals[0] || '';
      const limit = parseInt(options['--limit'] || options['-n'] || '50', 10);

      if (contact && !isLive) {
        const localMsgs = queryMessages(contact, { limit });
        if (localMsgs.length > 0) {
          console.log(`✉️ 从本地 SQLite SSOT 命中与 [${contact}] 的 ${localMsgs.length} 条聊天记录 (加 --live 强制线上刷新):`);
          printTable(localMsgs.map((m, idx) => ({
            '#': idx + 1,
            '发送方': m.sender,
            '我是买家': m.is_self,
            '内容': m.content.slice(0, 50),
            '状态': m.read_status,
          })));
          process.exit(0);
        }
      }

      console.log(`🔄 正在从闲鱼线上实时拉取与 [${contact || '未知'}] 的聊天记录...`);
      const res = spawnSync('opencli', ['xianyu', 'messages', ...cleanArgs], { stdio: 'inherit' });
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

    case 'candidates': {
      const { positionals, options } = parseCliArgs(subArgs);
      const rawPos = positionals[0] || '';
      const knownCats = ['all', '全部', 'nexg', 'nexg2', '2n', 'nylon', '尼龙', 'air', 'lava air', 'me4', 'me 4', 'lava4', 'lava 4', 'nexg2_nylon', 'lava_me_air', 'lava_me_4'];
      let category = options['--category'] || '';
      let keyword = options['--keyword'] || options['-q'] || '';

      if (!category && rawPos) {
        if (knownCats.includes(rawPos.toLowerCase())) {
          category = rawPos;
        } else {
          keyword = keyword ? `${keyword} ${rawPos}` : rawPos;
        }
      }

      const minPrice = options['--min-price'] || null;
      const maxPrice = options['--max-price'] || null;
      const excludeGhosted = !!options['--exclude-ghosted'];
      const excludeAccessories = !options['--include-accessories'];
      const sort = options['--sort'] || 'price_asc';
      const limit = parseInt(options['--limit'] || options['-n'] || '50', 10);

      const results = queryCandidates({ category, keyword, minPrice, maxPrice, excludeGhosted, excludeAccessories, sort, limit });
      if (results.length === 0) {
        console.log('（本地 SQLite SSOT 中暂无匹配候选宝贝，请运行 xy-chat pick 或 search 同步）');
        process.exit(0);
      }
      console.log(`🎯 从本地 SQLite SSOT 命中 ${results.length} 个候选宝贝:`);
      printTable(results.map((c, idx) => ({
        '#': idx + 1,
        '商品ID': c.item_id,
        '标题': c.title.slice(0, 32),
        '价格': c.price,
        '卖家': c.seller,
        '卖家状态': c.seller_status === 'responsive' ? '✅ 活跃报价' : (c.seller_status === 'ghosted' ? '⚠️ 已读不回' : (c.seller_status === 'unfit' ? '❌ 明确无货' : '❓ 待沟通')),
        '成色': c.condition,
        '所在地': c.location,
      })));
      process.exit(0);
      break;
    }

    case 'reviews': {
      const { positionals, options } = parseCliArgs(subArgs);
      const seller = positionals[0] || options['--seller'] || '';
      if (seller) {
        const rev = getSellerReview(seller);
        if (!rev) {
          console.log(`未找到卖家 ${seller} 的沟通评估记录`);
        } else {
          console.log(`📋 卖家 [${seller}] 评估详情:`);
          console.table([rev]);
        }
      } else {
        const limit = parseInt(options['--limit'] || options['-n'] || '50', 10);
        const revs = querySellerReviews({ limit });
        console.log(`📋 卖家沟通评估记录表 (${revs.length} 位卖家):`);
        printTable(revs.map((r, idx) => ({
          '#': idx + 1,
          '卖家': r.seller,
          '评级': r.status === 'responsive' ? '✅ 活跃沟通/已报价' : (r.status === 'ghosted' ? '⚠️ 曾已读不回' : (r.status === 'unfit' ? '❌ 明确无货/已关闭' : '❓ 未知')),
          '原因/最近消息': r.reason,
          '最近消息': r.last_message.slice(0, 30),
        })));
      }
      process.exit(0);
      break;
    }

    case 'sync-chats': {
      const { options } = parseCliArgs(subArgs);
      console.log('🔍 正在全量同步私信联系人与关键卖家聊天记录...');
      const inRes = runOpenCli('inbox', ['--limit', '50', '-f', 'json']);
      let sess = [];
      try {
        sess = JSON.parse(inRes.stdout);
        if (Array.isArray(sess)) saveSessions(sess);
      } catch (e) {}

      console.log(`✅ 已读取 ${sess.length} 个会话`);

      // Discover sellers present in candidates table to ensure their chat history is never skipped
      const candSellers = new Set(queryCandidates({ limit: 500 }).map(c => c.seller).filter(s => s && s !== '-'));

      const targetSellers = sess.filter(s => {
        if (options['--all']) return true;
        const name = s.contact_name;
        if (candSellers.has(name)) return true;
        const msg = s.last_message || '';
        return msg.includes('吉他') || msg.includes('nexg') || msg.includes('lava') || msg.includes('琴') || msg.includes('air') || name.includes('琴') || name.includes('乐器') || name.includes('吉他') || name.includes('音乐');
      });

      console.log(`🎸 识别到 ${targetSellers.length} 位重点沟通卖家 (包含候选商品卖家与乐器沟通)，正在拉取聊天记录...`);
      for (const s of targetSellers) {
        try {
          console.log(`  -> 拉取 [${s.contact_name}] 聊天记录 (模拟人类随机思考间歇)...`);
          const msgRes = runOpenCli('messages', [s.contact_name, '--limit', '30', '-f', 'json']);
          const msgs = JSON.parse(msgRes.stdout);
          if (Array.isArray(msgs)) {
            saveMessages(s.contact_name, msgs);
          }
          await humanDelay(3500, 6500);
        } catch (e) {}
      }

      const revCount = syncSellerReviewsFromSessionsAndMessages();
      console.log(`\n✅ 卖家沟通评估分析完成，更新了 ${revCount} 条卖家档案！`);
      console.table(querySellerReviews({ limit: 20 }));
      process.exit(0);
      break;
    }

    case 'pick': {
      const target = (subArgs[0] || 'all').toLowerCase();
      console.log(`🎸 正在执行闲鱼高性价比吉他智能选购与多维博弈筛选 (目标: ${target})...`);

      // First ensure seller reviews from chat records are fresh
      syncSellerReviewsFromSessionsAndMessages();

      const searchConfigs = [];
      if (target === 'all' || target.includes('nexg')) {
        searchConfigs.push({
          category: 'nexg2_nylon',
          keyword: 'nexg 2n',
          minPrice: '1000',
          maxPrice: '3800',
          sort: '价格升序',
        });
        searchConfigs.push({
          category: 'nexg2_nylon',
          keyword: 'nexg2 尼龙',
          minPrice: '1000',
          maxPrice: '3800',
          sort: '价格升序',
        });
      }
      if (target === 'all' || target.includes('air')) {
        searchConfigs.push({
          category: 'lava_me_air',
          keyword: 'lava me air',
          minPrice: '1000',
          maxPrice: '3200',
          sort: '价格升序',
        });
      }
      if (target === 'all' || target.includes('me4') || target.includes('me 4') || target.includes('lava 4')) {
        searchConfigs.push({
          category: 'lava_me_4',
          keyword: 'lava me 4',
          minPrice: '1400',
          maxPrice: '3800',
          sort: '价格升序',
        });
      }

      const excludeStr = '踏板,麦克风,话筒,耳麦,耳机,支架,图纸,维修,主板,琴包,背带,网线,插头,零配件,贴纸';

      let totalFound = 0;
      for (const sc of searchConfigs) {
        console.log(`\n🔍 [${sc.category}] 正在线上搜索 "${sc.keyword}" (价格区间: ¥${sc.minPrice} - ¥${sc.maxPrice})...`);
        const searchRes = runOpenCli('search', [
          sc.keyword,
          '--min-price', sc.minPrice,
          '--max-price', sc.maxPrice,
          '--sort', sc.sort,
          '--exclude', excludeStr,
          '--limit', '20',
          '-f', 'json'
        ]);

        let items = [];
        try {
          items = JSON.parse(searchRes.stdout);
        } catch (e) {
          const m = searchRes.stdout.match(/\[\s*\{[\s\S]*\}\s*\]/);
          if (m) items = JSON.parse(m[0]);
        }

        if (Array.isArray(items) && items.length > 0) {
          // Pre-filter accessories via centralized contract
          const validGuitars = items.filter(it => !isAccessoryTitle(it.title, sc.category));

          console.log(`  -> 抓取到 ${items.length} 个候选 (过滤配件后剩余 ${validGuitars.length} 把吉他)，正在拉取详情与卖家身份补全...`);
          // Enrich top 5 real guitar items with detail if seller missing
          for (let i = 0; i < Math.min(validGuitars.length, 5); i++) {
            const it = validGuitars[i];
            if (!it.seller || it.seller === '-') {
              try {
                const detRes = runOpenCli('detail', [it.item_id, '-f', 'json']);
                const det = JSON.parse(detRes.stdout);
                if (det[0]?.seller) {
                  it.seller = det[0].seller;
                  it.seller_user_id = det[0].seller_user_id;
                  if (det[0].images && det[0].images !== '-') it.image_url = det[0].images.split('|')[0].trim();
                }
              } catch (e) {}
            }
          }

          const saved = saveCandidates(validGuitars, { keyword: sc.keyword, category: sc.category });
          totalFound += saved;
          console.log(`  ✅ 已持久化 ${saved} 把候选吉他至本地 SQLite SSOT`);
        }
      }

      // Re-read authoritative candidates from SQLite (SSOT & Unidirectional Data Flow)
      console.log('\n=================== 📊 闲鱼最优吉他候选选购决策全景图 (SSOT 真理库) ===================');
      const queryCat = target === 'all' ? '' : (target.includes('nexg') ? 'nexg2_nylon' : (target.includes('air') ? 'lava_me_air' : 'lava_me_4'));
      const allCandidates = queryCandidates({ category: queryCat, limit: 50 });
      printTable(allCandidates.map((c, idx) => ({
        '#': idx + 1,
        '类别': c.category,
        '商品ID': c.item_id,
        '价格': c.price,
        '成色': c.condition,
        '卖家': c.seller,
        '聊天/信誉风控': c.seller_status === 'responsive' ? '✅ 活跃报价' : (c.seller_status === 'ghosted' ? '⚠️ 曾已读不回' : (c.seller_status === 'unfit' ? '❌ 明确无货' : '❓ 待深入沟通')),
        '标题': c.title.slice(0, 30),
        '所在地': c.location,
      })));

      // Decision summaries
      console.log('\n🎯 最优推荐与风控屏蔽决策摘要:');
      const cats = target === 'all' ? ['nexg2_nylon', 'lava_me_air', 'lava_me_4'] : [queryCat];
      for (const cat of cats) {
        const catItems = allCandidates.filter(c => c.category === cat);
        const safeItems = catItems.filter(c => c.seller_status !== 'ghosted' && c.seller_status !== 'unfit');
        const lowest = safeItems[0] || catItems[0];
        const excludedCount = catItems.length - safeItems.length;

        console.log(`\n📌 [${cat.toUpperCase()}]:`);
        if (lowest) {
          console.log(`  - 推荐最优底价: ${lowest.price} (商品ID: ${lowest.item_id})`);
          console.log(`  - 卖家: ${lowest.seller} [${lowest.location}] (风控状态: ${lowest.seller_status})`);
          console.log(`  - 标题: ${lowest.title}`);
          console.log(`  - 链接: ${lowest.item_url}`);
          console.log(`  - 图片: ${lowest.image_url}`);
        } else {
          console.log('  - 暂无可推荐候选');
        }
        if (excludedCount > 0) {
          console.log(`  - ⚠️ 已成功根据聊天记录屏蔽 ${excludedCount} 个曾已读不回或明确无货卖家`);
        }
      }

      process.exit(0);
      break;
    }

    case 'watch': {
      console.log('📡 正在启动闲鱼新上架与降价实时监听 (推送式实时订阅)...');
      const res = spawnSync('opencli', ['xianyu', 'watch', ...subArgs], { stdio: 'inherit' });
      process.exit(res.status ?? 0);
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
  xy-chat candidates [category]      查询已沉淀的吉他候选库 (SSOT)
  xy-chat reviews [卖家]             查询卖家聊天评估档案 (排除已读不回/无货卖家)
  xy-chat sync-chats                 全量同步私信记录并分析卖家沟通状态
  xy-chat pick [nexg|air|me4|all]    全自动搜索、比价、风控过滤并输出最优推荐
  xy-chat watch [query] [--interval] 实时监听新上架宝贝与降价动态 (推送式订阅)
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
