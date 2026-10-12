# Cadence Records

### `CAD-20260913-goofish-nexg2n-watch` - Goofish NEXG 2N Smart Guitar Price Watch & Notion Sync

| Field | Value |
|---|---|
| Status | `active` |
| Activation Status | `active` |
| Activation Mode | `agent_self_schedule` |
| Created | `2026-10-12` |
| Updated | `2026-10-12` |
| Created By | `Vec + Agent` |
| Planned By | `Vec + Agent` |
| Project Ref | `goofish-nexg2n-watch` |
| Execution Root | `{A_CODING_ROOT}/opencli-plugin-goofish` |
| Root Alias | `A_CODING_ROOT` |
| Runtime Project Label | `goofish-nexg2n-watch` |
| Primary Runtime | `antigravity` |
| Runtime Systems | `antigravity, webhook-hub, opencli` |
| Runtime Locator | `Antigravity → Automations → Goofish NEXG 2N Smart Guitar Price Watch & Notion Sync` |
| Schedule Frequency | `daily` |
| Schedule Expression | `30 9,13,18,21 * * *` |
| Timezone | `Asia/Bangkok` |
| Preferred Window | `midnight_credit` |
| Credit Policy | `prefer_midnight_5h_cap` |
| Catch Up Policy | `catch_up_when_awake` |
| Retry Policy | `retry_until_success` |
| Retry Interval Minutes | `15` |
| Max Catch Up Age Hours | `24` |
| Execution Mode | `incremental` |
| State Owner | `project_local` |
| Output Owner | `data/goofish.db` |
| Side Effect Level | `writes_local` |
| Requires Human Review | `false` |
| Network Required | `true` |
| Manual Paste Required | `false` |
| Manual Paste Payload | `not_required_sidecar_active` |
| Source Refs | `~/.config/goofish/sidecar.json; ./bin/xy-chat.js; webhook-hub:9423` |
| Checkpoint Path | `.run/cadence/CAD-20260913-goofish-nexg2n-watch/state.json` |
| Success Marker Pattern | `.run/cadence/CAD-20260913-goofish-nexg2n-watch/YYYY-MM-DD.success` |
| Resume Policy | `stateless` |
| Stop Condition | `none` |

#### Prompt

```text
Goofish NEXG 2N Smart Guitar Price Watch & Notion Sync
Antigravity project label: goofish-nexg2n-watch
Working directory: .
Cadence card: CAD-20260913-goofish-nexg2n-watch

Language requirement: All conversation replies, findings, and summary messages to the user must be in Chinese (全程使用中文回复与输出汇报).

Before doing work:
cd "."

Execute recurring cadence for Goofish NEXG 2N Smart Guitar Price Watch & Notion Sync.

1. Context & Input Ingestion (输入语境分析):
   - Inspect configurations: .env.example, .env, package.json.
   - Read prior checkpoint (.run/cadence/CAD-20260913-goofish-nexg2n-watch/state.json) and process incremental diffs.

2. Execute Automation Command (执行核心任务):
   ./bin/xy-chat.js watch --task-id task_1791773688487_v4pnsy --iterations 1 --diff-only --webhook http://127.0.0.1:9423/webhook/goofish --notify && ./bin/xy-chat.js notion-sync

3. Comprehensive Output Patterns (全景输出落地):
   - Update durable truth ledger: data/goofish.db
   - Generate dated execution receipt: reports/runs/YYYY-MM-DD.md (log diffs, evidence URLs, or no_change)
   - If dependency or credential fails: record blocked/failed receipt, do not mark success.
   - Write state checkpoint: .run/cadence/CAD-20260913-goofish-nexg2n-watch/<today>.success only after outputs are safe.

闭环自愈与演进要求：
- 闭环自愈与异常处理：若遇到测试失败、报错、网络超时或非 0 退出码，必须深入日志定位根因，优先就地自愈修复并重新验证，严禁隐瞒错误直接跳过打假卡。
- 真实对账与两端验证：写完从真实环境对答案（“没人跑的检查不算证据”），必须生成真实落地凭据，覆盖正向通路与对抗分支，确认无误后再标记完成。
- 系统演进与防腐化写回：针对高频摩擦点与新问题，杜绝分散制造一次性轮子，将能力收敛至原生工具链（Extend than fork）；沉淀至项目工具或脚本，更新 CHANGELOG 并同步写回底册（SSOT），杜绝隐形逻辑与代码腐烂。
- 自治目标与抗抖闭环：以自治目标模式闭环执行，全程抵抗瞬时网络抖动与流中断；若遇环境波动，自动等待恢复并继续推进，严禁未达门禁意外退出。
- 极简汇报与人类注意力保护：默认极简汇报或优雅跳过（Protect Human Attention）。若全绿健康且无新增异常，仅输出 3-5 行以内关键指标快照或优雅跳过（skip/no_change），严禁无问题时输出冗长展开套话；仅在检测到异常（issues）或执行了自愈修复/重大演进（improvements）时，才详细展开问题原因、修复代码与验证凭据。
- 重试成功脆弱点复盘与默认固化演进：凡遇执行失败后经重试成功（Retry & Succeed）或就地自愈修复的情况，严禁仅做临时修补！必须自动启动“核心脆弱点复盘”：深入剖析为何首次会发生事故（如超时预算过紧、并发锁竞争、网络抖动无退避、凭据衰减、未做前置探活等），并在执行凭据（reports/runs/）与运行日志中输出明确的【核心脆弱点复盘】与【建议加固方案】；更必须默认执行固化演进（Evolve by Default），就地加固底层脚本（增加超时缓冲/指数退避/锁隔离）或更新 Cadence Card 契约，杜绝同类隐形事故在无人值守时再次发生。
```
