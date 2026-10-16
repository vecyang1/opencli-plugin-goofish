/**
 * Production-Grade Notion Sync Bridge for Goofish Price Monitoring
 * Follows /designing-human-editable-ops-apps and /notion-mcp-connector contracts:
 * - Single source of truth reconciliation with SQLite SSOT
 * - Resilient network retry (3 attempts with exponential backoff)
 * - Safe type mapping (select vs text vs number)
 * - Bidirectional synchronization: pushes local status & bargains, pulls human edits
 */

import { 
  queryMonitoringTasks, 
  saveMonitoringTask, 
  updateMonitoringTask,
  queryPriceHistory,
  getPriceHistorySummary,
  getConfig,
  setConfig,
  getDb
} from '../clis/goofish/_db.js';

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const DEFAULT_PARENT_PAGE_ID = '12be1b43-2393-8064-a99f-eb2a407187fe'; // Dash collection

export function getNotionToken() {
  if (process.env.NOTION_TOKEN) return process.env.NOTION_TOKEN;
  if (process.env.NOTION_API_KEY) return process.env.NOTION_API_KEY;

  // 1. Check SQLite system_config (persisted locally, never in git)
  try {
    const dbToken = getConfig('notion_token');
    if (dbToken) return dbToken;
  } catch (e) {}

  // 2. Check local .env file
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf-8');
      const match = envContent.match(/NOTION_TOKEN=["']?([^"'\r\n]+)["']?/);
      if (match) return match[1];
    }
  } catch (e) {}

  // 3. Check machine MCP configuration (.claude.json)
  try {
    const claudeJsonPath = path.join(os.homedir(), '.claude.json');
    if (fs.existsSync(claudeJsonPath)) {
      const data = JSON.parse(fs.readFileSync(claudeJsonPath, 'utf-8'));
      const token = data?.mcpServers?.notion?.env?.NOTION_TOKEN;
      if (token) return token;
    }
  } catch (e) {}

  return '';
}

/**
 * Fetch helper with exponential backoff retry on ECONNRESET / 429 / 5xx
 */
async function notionFetch(endpoint, options = {}, retries = 3) {
  const token = getNotionToken();
  const url = endpoint.startsWith('http') ? endpoint : `${NOTION_API_BASE}${endpoint}`;
  
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  let lastError = null;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, { ...options, headers });
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('Retry-After') || '2', 10);
        await new Promise(r => setTimeout(r, retryAfter * 1000));
        continue;
      }
      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Notion API error (${res.status}): ${errBody}`);
      }
      return await res.json();
    } catch (err) {
      lastError = err;
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastError;
}

/**
 * Locate or create the Goofish monitoring database in Notion
 */
export async function ensureNotionDatabase(parentPageId = DEFAULT_PARENT_PAGE_ID) {
  if (process.env.NOTION_GOOFISH_DATABASE_ID) {
    return process.env.NOTION_GOOFISH_DATABASE_ID;
  }

  // Check system_config in SQLite first
  const cachedId = getConfig('notion_database_id');
  if (cachedId) {
    try {
      const db = await notionFetch(`/databases/${cachedId}`);
      if (db && db.id) return db.id;
    } catch (e) {
      // Cached ID was invalid or removed; proceed to search/create
    }
  }

  // 1. Search for existing database titled "闲鱼低价监控"
  try {
    const searchRes = await notionFetch('/search', {
      method: 'POST',
      body: JSON.stringify({
        query: '闲鱼低价监控',
        filter: { value: 'database', property: 'object' },
        page_size: 10,
      }),
    });

    if (searchRes.results && searchRes.results.length > 0) {
      const match = searchRes.results.find(db => {
        const titleText = (db.title || []).map(t => t.plain_text).join('');
        return titleText.includes('闲鱼') && titleText.includes('监控');
      });
      if (match) {
        setConfig('notion_database_id', match.id);
        return match.id;
      }
    }
  } catch (e) {
    // Ignore search failure, fall through to creation
  }

  // 2. Create database under parent page
  const createPayload = {
    parent: {
      type: 'page_id',
      page_id: parentPageId,
    },
    title: [
      {
        type: 'text',
        text: { content: '🎯 闲鱼低价监控与捡漏雷达 (Goofish Price Tracker)' },
      },
    ],
    properties: {
      'Task / Keyword': {
        title: {},
      },
      'Task ID': {
        rich_text: {},
      },
      'Status': {
        select: {
          options: [
            { name: '🟢 监控中', color: 'green' },
            { name: '⚪ 已暂停', color: 'gray' },
            { name: '🚨 发现低价', color: 'red' },
          ],
        },
      },
      'Category': {
        select: {
          options: [
            { name: 'nexg2_nylon', color: 'purple' },
            { name: 'ugreen_hub', color: 'blue' },
            { name: 'lava_me_air', color: 'orange' },
            { name: 'sony_a7m4', color: 'yellow' },
            { name: 'other', color: 'default' },
          ],
        },
      },
      'Target Price': {
        number: { format: 'number' },
      },
      'Price Floor': {
        number: { format: 'number' },
      },
      'Current Low': {
        number: { format: 'number' },
      },
      'Historical Low': {
        number: { format: 'number' },
      },
      'Spotted Count': {
        number: { format: 'number' },
      },
      'Below Target Count': {
        number: { format: 'number' },
      },
      'Notes': {
        rich_text: {},
      },
      'Last Checked': {
        date: {},
      },
      'Goofish Search URL': {
        url: {},
      },
    },
  };

  const createdDb = await notionFetch('/databases', {
    method: 'POST',
    body: JSON.stringify(createPayload),
  });

  setConfig('notion_database_id', createdDb.id);
  return createdDb.id;
}

/**
 * Push local monitoring tasks to Notion database (Idempotent upsert by Task ID)
 */
export async function pushTasksToNotion(databaseId) {
  const tasks = queryMonitoringTasks();
  if (tasks.length === 0) return { pushed: 0, updated: 0 };

  // 1. Query existing pages in the database to map by Task ID
  const queryRes = await notionFetch(`/databases/${databaseId}/query`, {
    method: 'POST',
    body: JSON.stringify({ page_size: 100 }),
  });

  const existingPagesByTaskId = new Map();
  for (const page of queryRes.results) {
    const rawTaskId = page.properties?.['Task ID']?.rich_text?.[0]?.plain_text || '';
    if (rawTaskId) {
      existingPagesByTaskId.set(rawTaskId, page.id);
    }
  }

  let pushed = 0;
  let updated = 0;

  for (const t of tasks) {
    let statusLabel = '🟢 监控中';
    if (t.status === 'paused') statusLabel = '⚪ 已暂停';
    if (t.status === 'alerting') statusLabel = '🚨 发现低价';

    const searchUrl = `https://www.goofish.com/search?q=${encodeURIComponent(t.keyword)}`;
    const pageProps = {
      'Task / Keyword': {
        title: [{ type: 'text', text: { content: t.keyword } }],
      },
      'Task ID': {
        rich_text: [{ type: 'text', text: { content: t.task_id } }],
      },
      'Status': {
        select: { name: statusLabel },
      },
      'Category': {
        select: { name: t.category || 'other' },
      },
      'Target Price': {
        number: t.target_price || null,
      },
      'Price Floor': {
        number: t.price_floor || null,
      },
      'Current Low': {
        number: t.current_low_price || null,
      },
      'Historical Low': {
        number: t.historical_low_price || null,
      },
      'Spotted Count': {
        number: t.total_spotted_count || 0,
      },
      'Below Target Count': {
        number: t.below_target_count || 0,
      },
      'Notes': {
        rich_text: t.notes ? [{ type: 'text', text: { content: t.notes.slice(0, 500) } }] : [],
      },
      'Goofish Search URL': {
        url: searchUrl,
      },
    };

    if (t.last_checked_at) {
      try {
        pageProps['Last Checked'] = {
          date: { start: new Date(t.last_checked_at).toISOString() },
        };
      } catch (e) {}
    }

    const existingPageId = existingPagesByTaskId.get(t.task_id);
    if (existingPageId) {
      await notionFetch(`/pages/${existingPageId}`, {
        method: 'PATCH',
        body: JSON.stringify({ properties: pageProps }),
      });
      updated++;
    } else {
      await notionFetch('/pages', {
        method: 'POST',
        body: JSON.stringify({
          parent: { database_id: databaseId },
          properties: pageProps,
        }),
      });
      pushed++;
    }

    // Rate pacing: 3 requests/sec
    await new Promise(r => setTimeout(r, 350));
  }

  return { pushed, updated };
}

/**
 * Pull human edits from Notion back into local SQLite SSOT
 * e.g. Operator pauses a task or changes target price directly in Notion UI
 */
export async function pullNotionEditsToDb(databaseId) {
  const queryRes = await notionFetch(`/databases/${databaseId}/query`, {
    method: 'POST',
    body: JSON.stringify({ page_size: 100 }),
  });

  let syncedBack = 0;
  for (const page of queryRes.results) {
    const taskId = page.properties?.['Task ID']?.rich_text?.[0]?.plain_text || '';
    if (!taskId) continue;

    const statusVal = page.properties?.['Status']?.select?.name || '';
    const targetPriceVal = page.properties?.['Target Price']?.number;
    const notesVal = page.properties?.['Notes']?.rich_text?.[0]?.plain_text;

    let localStatus = null;
    if (statusVal.includes('暂停')) localStatus = 'paused';
    else if (statusVal.includes('监控')) localStatus = 'active';

    const updates = {};
    if (localStatus) updates.status = localStatus;
    if (typeof targetPriceVal === 'number' && targetPriceVal > 0) updates.target_price = targetPriceVal;
    if (notesVal !== undefined) updates.notes = notesVal;

    if (Object.keys(updates).length > 0) {
      const ok = updateMonitoringTask(taskId, updates);
      if (ok) syncedBack++;
    }
  }

  return { syncedBack };
}

/**
 * Full Bidirectional Sync Orchestrator
 */
export async function syncWithNotion(options = {}) {
  const startTime = Date.now();
  const dbId = options.databaseId || await ensureNotionDatabase(options.parentPageId);

  // 1. Pull human edits from Notion into SQLite
  const pullResult = await pullNotionEditsToDb(dbId);

  // 2. Push SQLite tasks and metrics to Notion
  const pushResult = await pushTasksToNotion(dbId);

  const durationMs = Date.now() - startTime;
  return {
    success: true,
    database_id: dbId,
    notion_url: `https://notion.so/${dbId.replace(/-/g, '')}`,
    pulled_from_notion: pullResult.syncedBack,
    pushed_new_to_notion: pushResult.pushed,
    updated_in_notion: pushResult.updated,
    duration_ms: durationMs,
    synced_at: new Date().toISOString(),
  };
}
