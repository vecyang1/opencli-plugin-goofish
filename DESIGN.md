<!-- Scope: project-local -->
# Design System Specification - Goofish Price Monitoring & Ops Dashboard

This document establishes the authoritative design tokens, visual hierarchy, interaction rules, and observability patterns for the Goofish operations dashboard and user interfaces.

## 1. Design Philosophy & Surface Mode

- **Core Theme**: Dark Luxury / Technical Precision (`#0a0f1d` deep obsidian surface with high-contrast `#f1f5f9` typography and `#38bdf8` cyan accents).
- **Domain**: Human-Editable Operations App (`/designing-human-editable-ops-apps`).
- **Principles**:
  - **High Observability**: "凡称可配置，必须可检查；凡有业务规则，必须能找到对账依据。"
  - **Zero Facade**: Real data roundtrip (SQLite WAL SSOT); zero mock data, zero dead buttons, zero `setTimeout` fake delays.
  - **Dark-Surface High-Contrast Invariant**: All headings, values, and table cells strictly maintain high-contrast text (`#f1f5f9` primary, `#94a3b8` muted, never framework default dark-gray `#31333F`).

## 2. Design Tokens (`web/styles.css`)

### Color Palette
```css
:root {
  /* Surfaces */
  --bg-main: #0a0f1d;
  --bg-card: #131c31;
  --bg-card-hover: #1a2642;
  --bg-input: #0e1526;
  
  /* Borders */
  --border-color: #22304d;
  --border-focus: #38bdf8;
  
  /* Typography */
  --text-main: #f1f5f9;
  --text-muted: #94a3b8;
  
  /* Accents & States */
  --accent-cyan: #38bdf8;   /* Primary Actions & Focus */
  --accent-green: #10b981;  /* Active & Healthy Status */
  --accent-amber: #f59e0b;  /* Paused & Attention Notice */
  --accent-rose: #f43f5e;   /* Alert & Low-Price Bargain */
  --accent-purple: #a855f7; /* Inspection & Pipeline Stage */
  
  /* Spacing & Radii */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  
  /* Elevation Shadows */
  --shadow-sm: 0 2px 4px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4);
  --shadow-glow: 0 0 20px rgba(56, 189, 248, 0.15);
}
```

### Typography Hierarchy
- **Font Stack**: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`
- **Application Title**: `18px / 600`, letter-spacing `-0.01em`, `#f1f5f9`
- **Workspace Section Titles**: `20px / 700`, `#f1f5f9`
- **Metric Cards Numbers**: `24px / 800`, monospaced numerals, accent-colored
- **Table Data Cells**: `13px / 400`, `#f1f5f9`, border `#22304d`
- **Badges**: `11px / 600`, border-radius `4px`, padding `3px 8px`

## 3. Workspaces & Visual Layout Architecture

1. **Header Bar (Sticky Top)**:
   - Left: Platform Brand & SQLite SSOT Live Indicator (`#10b981` pulsing LED).
   - Center: Tab switcher for 5 operational views.
   - Right: Real-time latency badge and quick Notion manual sync CTA.

2. **Metrics Bar (4-Column Grid)**:
   - Active Tasks Count (Cyan)
   - Low-Price Alert Spikes (Rose)
   - Tracked Candidates Count (Amber)
   - Notion Sync Status & Timestamp (Green)

3. **Operational Tabs**:
   - `🎯 监控任务队列`: Full task lifecycle (Add modal, Pause, Resume, Scan, Delete).
   - `🚨 捡漏发现雷达`: Live bargain card feed with seller reputation & direct item links.
   - `📈 历史底价走势`: Percentile distribution cards and historical lowest price listings.
   - `🔍 规则对账诊断器`: 4-stage filter pipeline (Positive include -> Negative exclude -> Price floor -> Target price) with pass/fail visual badge trees.
   - `🔄 Notion 双向同步`: Database connection status, sync logs, and schema fields.

## 4. Verification & Responsive Contract

- **Viewports Tested**:
  - Desktop: `1280x800` (Full grid with multi-column table layout).
  - Mobile: `390x844` (Responsive flex wrapping, horizontal scroll table cards, touchable buttons min 44px height).
- **Browser Automation Verification**: `/ego-browser` automated E2E script (`tests/e2e_verify.mjs`) enforcing 0 console errors, real state transitions, and DOM persistence.
