# Interactive Audit & Facade Inventory (Zero-Facade Verification)

**Audit Date**: 2026-10-12  
**Target Repository**: `opencli-plugin-goofish` (v1.9.0)  
**Storage SSOT Engine**: `node:sqlite` (`~/data/goofish.db` / `data/goofish.db` in WAL mode)  
**Web Operations Control Plane**: `src/server.js` (Port 3838) + `web/` (`index.html`, `app.js`, `styles.css`)  
**E2E Test Engine**: `/ego-browser` + `tests/e2e_verify.mjs`

---

## 1. Interactive Inventory & Facade Inspection Table

| Area (Header / Tabs / Modals / Table) | Element & Action | Current Implementation | Target Production Behavior | Persistence / API Destination | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Header** | SSE Live Status Badge | Real | Real-time SSE connection indicator (`online` / `reconnecting` / `offline`) | EventSource (`/api/events`) | ✅ Real (Zero Facade) |
| **Header** | Stats Summary Ticker | Real | Computes live task count, alerting task count, and total snipe count | `GET /api/stats` -> SQLite SSOT queries | ✅ Real (Zero Facade) |
| **Navigation** | Tab 1: 🎯 监控任务队列 | Real | Switches active view, fetches task list from SQLite, updates table DOM | `GET /api/tasks` | ✅ Real (Zero Facade) |
| **Navigation** | Tab 2: 🚨 捡漏发现雷达 | Real | Switches view, filters below-target candidates, renders seller reputation | `GET /api/candidates?is_below_target=1` | ✅ Real (Zero Facade) |
| **Navigation** | Tab 3: 📈 历史底价走势 | Real | Calculates rolling floor, median, percentiles, and renders price record feed | `GET /api/history` -> `computePriceHistoryStats` | ✅ Real (Zero Facade) |
| **Navigation** | Tab 4: 🔍 规则对账诊断器 | Real | Interactive inspector ("能读·能试·能调") executing 4-step filter gates | `POST /api/diagnose` -> `clis/goofish/_contract.js` | ✅ Real (Zero Facade) |
| **Navigation** | Tab 5: 🔄 Notion 双向同步 | Real | Triggers bidirectional reconciliation with Notion database | `POST /api/notion/sync` -> Notion API v1 | ✅ Real (Zero Facade) |
| **Tasks Tab** | "新建监控任务" Modal Button | Real | Opens task creation modal dialog, clears previous input | Local DOM State & Form reset | ✅ Real (Zero Facade) |
| **Create Modal** | Task Creation Form Submit | Real | Validates parameters, executes idempotent insert into `monitoring_tasks` | `POST /api/tasks` -> SQLite `saveMonitoringTask` | ✅ Real (Zero Facade) |
| **Create Modal** | Modal Close / Backdrop Click | Real | Closes modal dialog without side effects | Local DOM State | ✅ Real (Zero Facade) |
| **Tasks Table** | ⏸️ 暂停 / ▶️ 恢复 Toggle Button | Real | Updates task status between `active` and `paused`, broadcasts SSE event | `PATCH /api/tasks/:id` -> SQLite `updateMonitoringTask` | ✅ Real (Zero Facade) |
| **Tasks Table** | 🔍 立即扫描 Trigger Button | Real | Runs on-demand scan check, updates candidate metrics and price history | `POST /api/tasks/:id/scan` -> `recordPriceHistory` | ✅ Real (Zero Facade) |
| **Tasks Table** | 🗑️ 删除 Task Button | Real | Removes monitoring task from SQLite SSOT, broadcasts SSE | `DELETE /api/tasks/:id` -> SQLite `deleteMonitoringTask` | ✅ Real (Zero Facade) |
| **Bargain Feed** | 闲鱼直达详情外链 | Real | Opens genuine Goofish item link (`item.taobao.com` / `m.goofish.com`) | External Link Navigation (`target="_blank"`) | ✅ Real (Zero Facade) |
| **Diagnostic Tab** | "执行规则诊断测试" Form | Real | Tests input title and price against filter rules, returns detailed receipts | `POST /api/diagnose` -> step-by-step pipeline | ✅ Real (Zero Facade) |
| **Notion Tab** | "立即执行双向同步" Button | Real | Runs bidirectional sync, pulls human edits and pushes live metrics | `POST /api/notion/sync` -> `src/notion-sync.js` | ✅ Real (Zero Facade) |
| **Notion Tab** | "打开 Notion 数据库" Link | Real | Opens Notion database in browser | `https://notion.so/3f7e1b43239381f7bc8ee3131a3534be` | ✅ Real (Zero Facade) |

**Facade Summary**: Total Facades = **0**. Dead Clicks = **0**. Dummy Timers = **0**. Static Mock Arrays = **0**.

---

## 2. Real Data Round-Trip Verification

All created and updated state is persisted into the SQLite database (`data/goofish.db`) in WAL mode.
- **Page Reload Persistence**: Verified via `/ego-browser` in `tests/e2e_verify.mjs`. After creating task `task_e2e_test_99` and issuing `page.reload()`, the newly created task persisted in both the DOM and SQLite storage with 100% fidelity.
- **SSE Push Updates**: Verified via `dbEmitter`. Database mutations emit real-time events (`table:monitoring_tasks`, `table:price_history`, `mutation`) pushing live state changes directly into the connected browser interface without manual refresh.
- **Zero Console Errors**: Verified via `/ego-browser` automated inspection (`window._consoleErrors.length === 0`).
