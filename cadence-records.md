# Cadence Records

### `CAD-20260913-goofish-nexg2n-watch` - 闲鱼 NEXG 2N 尼龙弦智能吉他周期监控

| Field | Value |
|---|---|
| Status | `active` |
| Activation Status | `active` |
| Activation Mode | `agent_self_schedule` |
| Created | `2026-09-13` |
| Updated | `2026-09-13` |
| Created By | `Vec` |
| Planned By | `Vec` |
| Project Ref | `opencli-plugin-goofish — 闲鱼智能吉他周期监控` |
| Execution Root | `{PROJECT_ROOT}` |
| Root Alias | `PROJECT_ROOT` |
| Runtime Project Label | `opencli-plugin-goofish` |
| Primary Runtime | `webhook-hub` |
| Runtime Systems | `webhook-hub, opencli, launchd` |
| Schedule Frequency | `every_15_minutes` |
| Schedule Expression | `*/15 * * * *` |
| Timezone | `Asia/Bangkok` |
| Preferred Window | `anytime` |
| Credit Policy | `no_ai_credit` |
| Catch Up Policy | `skip_if_stale` |
| Retry Policy | `retry_3_times` |
| Retry Interval Minutes | `5` |
| Max Catch Up Age Hours | `2` |
| Execution Mode | `incremental` |
| State Owner | `project_local` |
| Checkpoint Path | `.run/cadence/CAD-20260913-goofish-nexg2n-watch/state.json` |
| Success Marker Pattern | `.run/cadence/CAD-20260913-goofish-nexg2n-watch/YYYY-MM-DD.success` |
| Resume Policy | `resume_from_checkpoint` |
| Stop Condition | `sec_captcha_detected` |
| Output Owner | `data/goofish.db` |
| Side Effect Level | `writes_local` |
| Requires Human Review | `false` |
| Network Required | `true` |
| Manual Paste Required | `false` |
| Manual Paste Payload | `not_required_config_enabled_project_bound` |
| Source Refs | `xy-chat watch; webhook-hub:9423` |

#### Operational Contract

This periodic monitoring cadence continuously runs on a 15-minute schedule to track new listings and price drops for the **ENYA NEXG 2N nylon string smart guitar** ("nexg2n 尼龙的那个版本") on Xianyu.

1. Execution Command:
   ```bash
   node bin/xy-chat.js watch "nexg 2n 尼龙" --category nexg2_nylon --max-price 2500 --iterations 1 --diff-only --webhook http://127.0.0.1:9423/webhook/goofish --notify
   ```
2. Invariants & Safety:
   - Filters out steel string models (`非尼龙|钢弦|民谣`), guitar accessories (`踏板|琴包|耳机|麦克风`), and junk listings (< ¥400).
   - Writes authoritative candidates to local SQLite SSOT (`data/goofish.db`).
   - Dispatches real-time JSON alert to `webhook-hub` (port 9423) and triggers desktop banner notifications on new arrivals or price reductions.
   - Settle delay and random Gaussian jitter prevent bot risk detection.
