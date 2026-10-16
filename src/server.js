/**
 * Production-Grade Web Operations Dashboard Server for Goofish Ops
 * 
 * Features:
 * - Native node:http architecture (zero external dependencies)
 * - Single source of truth backed by SQLite WAL mode
 * - Real-time Server-Sent Events (SSE) push streaming
 * - Complete REST API for tasks, candidates, price history, and Notion sync
 * - Interactive "能读·能试·能调" Diagnostic Engine (Inspector)
 * - Zero-Facade Invariant: all interactions execute real DB writes surviving page reloads
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { 
  getDb,
  getDbStats, 
  queryMonitoringTasks, 
  getMonitoringTask,
  saveMonitoringTask, 
  updateMonitoringTask, 
  deleteMonitoringTask,
  queryCandidates,
  queryPriceHistory,
  getPriceHistorySummary,
  recordPriceHistory,
  dbEmitter
} from '../clis/goofish/_db.js';

import { 
  PRODUCT_CATALOG,
  getProductSpec, 
  inferCategory, 
  isAccessoryTitle, 
  extractMultiImageDefects,
  assessLowPriceTrap,
  validateMonitoringTask,
  explainCandidateEvaluation
} from '../clis/goofish/_contract.js';

import { syncWithNotion } from './notion-sync.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_DIR = path.join(__dirname, '../web');

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(JSON.stringify(data));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 2 * 1024 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

export function createDashboardServer(options = {}) {
  const sseClients = new Set();

  // Wire SQLite DB mutations to SSE broadcast
  const onMutation = (evt) => {
    const dataStr = `data: ${JSON.stringify(evt)}\n\n`;
    for (const client of sseClients) {
      try {
        client.write(dataStr);
      } catch (e) {
        sseClients.delete(client);
      }
    }
  };
  dbEmitter.on('mutation', onMutation);

  const server = http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = reqUrl.pathname;
    const method = req.method;

    // Handle CORS preflight
    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      });
      return res.end();
    }

    try {
      // 1. SSE Real-Time Event Stream
      if (pathname === '/api/events' && method === 'GET') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        });
        res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);
        sseClients.add(res);

        const keepAlive = setInterval(() => {
          try {
            res.write(': ping\n\n');
          } catch (e) {
            clearInterval(keepAlive);
            sseClients.delete(res);
          }
        }, 15000);

        req.on('close', () => {
          clearInterval(keepAlive);
          sseClients.delete(res);
        });
        return;
      }

      // 2. REST API: Statistics
      if (pathname === '/api/stats' && method === 'GET') {
        const dbStats = getDbStats();
        const tasks = queryMonitoringTasks();
        const activeTasks = tasks.filter(t => t.status === 'active').length;
        const pausedTasks = tasks.filter(t => t.status === 'paused').length;
        const alertingTasks = tasks.filter(t => t.status === 'alerting').length;
        const totalSpotted = tasks.reduce((sum, t) => sum + (t.total_spotted_count || 0), 0);
        const totalBelowTarget = tasks.reduce((sum, t) => sum + (t.below_target_count || 0), 0);

        return sendJson(res, 200, {
          success: true,
          stats: {
            ...dbStats,
            total_tasks: tasks.length,
            active_tasks: activeTasks,
            paused_tasks: pausedTasks,
            alerting_tasks: alertingTasks,
            total_spotted: totalSpotted,
            total_below_target: totalBelowTarget,
            server_time: new Date().toISOString(),
          }
        });
      }

      // 3. REST API: Tasks (List & Create)
      if (pathname === '/api/tasks') {
        if (method === 'GET') {
          const status = reqUrl.searchParams.get('status') || null;
          const keyword = reqUrl.searchParams.get('keyword') || null;
          const category = reqUrl.searchParams.get('category') || null;
          const tasks = queryMonitoringTasks({ status, keyword, category });
          return sendJson(res, 200, { success: true, count: tasks.length, tasks });
        }

        if (method === 'POST') {
          const body = await parseJsonBody(req);
          const rawKeyword = String(body.keyword || '').trim();
          if (!rawKeyword) {
            return sendJson(res, 400, { success: false, error: '关键词不能为空 (keyword is required)' });
          }

          const spec = getProductSpec(body.category || rawKeyword);
          const category = body.category ? String(body.category).trim() : (spec ? spec.category : inferCategory({ keyword: rawKeyword }));
          const targetPrice = parseFloat(body.target_price) || 0;
          const priceFloor = parseFloat(body.price_floor) || (spec ? spec.priceFloor : 0);
          const maxPrice = parseFloat(body.max_price) || 0;

          const taskData = {
            keyword: rawKeyword,
            category,
            target_price: targetPrice,
            price_floor: priceFloor,
            max_price: maxPrice,
            require_keywords: body.require_keywords ? String(body.require_keywords).trim() : '',
            exclude_keywords: body.exclude_keywords ? String(body.exclude_keywords).trim() : '',
            interval_sec: Math.max(60, Number(body.interval_sec) || 1800),
            webhook_url: body.webhook_url ? String(body.webhook_url).trim() : '',
            notes: body.notes ? String(body.notes).trim() : '',
            status: body.status || 'active',
          };

          const created = saveMonitoringTask(taskData);
          return sendJson(res, 201, { success: true, task: created });
        }
      }

      // 4. REST API: Single Task Actions (Update, Delete, Trigger Scan)
      const taskMatch = pathname.match(/^\/api\/tasks\/([^/]+)(?:\/([^/]+))?$/);
      if (taskMatch) {
        const taskId = decodeURIComponent(taskMatch[1]);
        const subAction = taskMatch[2];

        // Trigger manual scan
        if (subAction === 'scan' && method === 'POST') {
          const task = getMonitoringTask(taskId);
          if (!task) return sendJson(res, 404, { success: false, error: '任务不存在' });

          // Run scan simulation / local matching check
          const candidates = queryCandidates({ category: task.category, keyword: task.keyword, limit: 10 });
          const nowStr = new Date().toISOString();
          
          let currentLow = task.current_low_price || 0;
          let historicalLow = task.historical_low_price || 0;
          let spottedCount = task.total_spotted_count || 0;
          let belowCount = task.below_target_count || 0;
          let newAlerts = 0;

          if (candidates.length > 0) {
            for (const c of candidates) {
              spottedCount++;
              if (currentLow === 0 || c.price_num < currentLow) {
                currentLow = c.price_num;
              }
              if (historicalLow === 0 || c.price_num < historicalLow) {
                historicalLow = c.price_num;
              }
              if (task.target_price > 0 && c.price_num <= task.target_price) {
                belowCount++;
                newAlerts++;
              }
            }

            // Record into price history
            recordPriceHistory(candidates, {
              task_id: task.task_id,
              keyword: task.keyword,
              category: task.category,
              target_price: task.target_price,
            });
          }

          const updated = updateMonitoringTask(taskId, {
            current_low_price: currentLow,
            historical_low_price: historicalLow,
            total_spotted_count: spottedCount,
            below_target_count: belowCount,
            last_checked_at: nowStr,
            status: newAlerts > 0 ? 'alerting' : task.status,
          });

          return sendJson(res, 200, {
            success: true,
            task: updated,
            scan_summary: {
              candidates_checked: candidates.length,
              new_alerts: newAlerts,
              lowest_spotted: currentLow,
              scanned_at: nowStr,
            }
          });
        }

        if (method === 'PATCH') {
          const updates = await parseJsonBody(req);
          const updated = updateMonitoringTask(taskId, updates);
          if (!updated) return sendJson(res, 404, { success: false, error: '任务不存在' });
          return sendJson(res, 200, { success: true, task: updated });
        }

        if (method === 'DELETE') {
          const ok = deleteMonitoringTask(taskId);
          if (!ok) return sendJson(res, 404, { success: false, error: '任务不存在' });
          return sendJson(res, 200, { success: true, task_id: taskId });
        }
      }

      // 5. REST API: Candidates
      if (pathname === '/api/candidates' && method === 'GET') {
        const category = reqUrl.searchParams.get('category') || '';
        const keyword = reqUrl.searchParams.get('keyword') || '';
        const minPrice = reqUrl.searchParams.get('min_price') || null;
        const maxPrice = reqUrl.searchParams.get('max_price') || null;
        const sort = reqUrl.searchParams.get('sort') || 'price_asc';
        const limit = Math.min(Number(reqUrl.searchParams.get('limit')) || 50, 200);

        const candidates = queryCandidates({ category, keyword, minPrice, maxPrice, sort, limit });
        return sendJson(res, 200, { success: true, count: candidates.length, candidates });
      }

      // 6. REST API: Price History & Summary Stats
      if (pathname === '/api/history' && method === 'GET') {
        const keyword = reqUrl.searchParams.get('keyword') || '';
        const category = reqUrl.searchParams.get('category') || '';
        const targetPrice = parseFloat(reqUrl.searchParams.get('target_price')) || 0;
        const spikesOnly = reqUrl.searchParams.get('spikes_only') === 'true';
        const limit = Math.min(Number(reqUrl.searchParams.get('limit')) || 50, 200);

        const records = queryPriceHistory({
          keyword: keyword || null,
          category: category || null,
          is_below_target: spikesOnly ? true : null,
          limit,
        });

        const summary = getPriceHistorySummary({
          keyword,
          category,
          target_price: targetPrice,
        });

        return sendJson(res, 200, {
          success: true,
          count: records.length,
          summary,
          records,
        });
      }

      // 7. REST API: Rules ("能读")
      if (pathname === '/api/rules' && method === 'GET') {
        const catalogList = [];
        for (const [key, spec] of PRODUCT_CATALOG.entries()) {
          catalogList.push({
            id: key,
            category: spec.category,
            archetype: spec.archetype,
            default_query: spec.defaultQuery,
            price_floor: spec.priceFloor,
            description: spec.description || '',
            aliases: spec.aliases || [],
          });
        }
        return sendJson(res, 200, { success: true, catalog: catalogList });
      }

      // 8. REST API: Diagnostic Engine ("能试" - 统一 SSOT 契约调用)
      if (pathname === '/api/diagnose' && method === 'POST') {
        const body = await parseJsonBody(req);
        const evalResult = explainCandidateEvaluation({
          title: body.title,
          price: body.price,
          description: body.description,
          category: body.category,
          customExclude: body.exclude ? String(body.exclude).split(/[,，]/).map(s => s.trim()).filter(Boolean) : [],
          customRequire: body.require ? String(body.require).split(/[,，]/).map(s => s.trim()).filter(Boolean) : [],
          targetPrice: body.target_price || body.targetPrice,
          priceFloor: body.price_floor,
        });

        return sendJson(res, 200, {
          success: true,
          input: {
            title: evalResult.title,
            price: evalResult.price,
            category: evalResult.category,
            target_price: parseFloat(body.target_price) || (body.targetPrice ? parseFloat(body.targetPrice) : 0),
            price_floor: evalResult.price_floor,
          },
          verdict: evalResult.verdict,
          verdict_badge: evalResult.verdict_badge,
          action: evalResult.action,
          trace: evalResult.trace,
          low_price_assessment: evalResult.low_price_assessment,
          explanation: evalResult.explanation,
        });
      }

      // 9. REST API: Notion Sync Bridge
      if (pathname === '/api/notion/sync' && method === 'POST') {
        const body = await parseJsonBody(req).catch(() => ({}));
        const syncResult = await syncWithNotion(body);
        return sendJson(res, 200, syncResult);
      }

      // 10. Static File Serving (Web UI)
      let filePath = path.join(WEB_DIR, pathname === '/' ? 'index.html' : pathname);
      
      // Prevent directory traversal
      if (!filePath.startsWith(WEB_DIR)) {
        res.writeHead(403);
        return res.end('Forbidden');
      }

      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes = {
          '.html': 'text/html; charset=utf-8',
          '.css': 'text/css; charset=utf-8',
          '.js': 'application/javascript; charset=utf-8',
          '.json': 'application/json; charset=utf-8',
          '.png': 'image/png',
          '.svg': 'image/svg+xml',
          '.ico': 'image/x-icon',
        };
        const contentType = mimeTypes[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        fs.createReadStream(filePath).pipe(res);
        return;
      }

      // Fallback 404
      sendJson(res, 404, { success: false, error: `Route not found: ${method} ${pathname}` });
    } catch (err) {
      console.error('Dashboard Server Error:', err);
      sendJson(res, 500, { success: false, error: err.message });
    }
  });

  return {
    server,
    listen(port = 3838, host = '127.0.0.1') {
      return new Promise((resolve) => {
        server.listen(port, host, () => {
          const addr = server.address();
          resolve(addr);
        });
      });
    },
    close() {
      return new Promise((resolve) => {
        dbEmitter.removeListener('mutation', onMutation);
        for (const client of sseClients) {
          try { client.end(); } catch (e) {}
        }
        sseClients.clear();
        server.close(resolve);
      });
    }
  };
}

export async function startDashboardServer(options = {}) {
  const port = Number(options.port) || Number(process.env.PORT) || 3838;
  const host = options.host || '127.0.0.1';
  const dashboard = createDashboardServer(options);
  const addr = await dashboard.listen(port, host);
  const url = `http://${host}:${addr.port}`;
  console.log(`\n🚀 闲鱼生产级价格监控与捡漏管理平台已启动:`);
  console.log(`🌐 访问地址: ${url}`);
  console.log(`📊 离线知识库: SQLite WAL 模式 (本地单一事实来源)`);
  console.log(`📡 实时订阅: Server-Sent Events (SSE) 已挂载\n`);
  return { dashboard, url, port: addr.port };
}
