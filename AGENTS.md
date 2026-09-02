> Scope: project-local. Operational rules for agents maintaining opencli-plugin-goofish.

# Agent Instructions: opencli-plugin-goofish

## Single Chokepoint & Transport Architecture
- **Alias & Surface Parity**: "xianyu cli", "goofish cli", and "闲鱼 CLI" all refer to this plugin. Both `opencli xianyu <subcommand>` and `opencli goofish <subcommand>` are built from the same 18 command definitions in `clis/goofish/` — but what OpenCLI *serves* is the real-file copies in `~/.opencli/clis/goofish/` and `~/.opencli/clis/xianyu/` written by `npm run install-adapters` (the `xianyu` copy has its `site:` line rewritten; OpenCLI keys commands by that field). Editing `clis/goofish/` changes nothing until the installer runs, and `npm test`'s drift guard stays red until it does. Never symlink a site dir: OpenCLI's loader skips symlinks silently (measured 2026-09-02 — `goofish` had been a symlink since 2026-08-29, so `opencli goofish *` never existed and `xianyu seller` served stale code).
- **Keep `page.evaluate` in function form** (`page.evaluate(() => …)`), never a template string: `node --check` cannot see inside a template literal, so a `SyntaxError` there only surfaces against a logged-in browser.
- **Verification order**: `npm test` → `npm run install-adapters` (receipt: `opencli list` shows both sites) → `opencli xianyu login` if `whoami` returns `AUTH_REQUIRED` → run the changed command live.
- All commands execute through OpenCLI's browser runtime (`browser: true, navigateBefore: false, strategy: Strategy.COOKIE`).
- The browser instance connects to Chrome Profile 2 where the user is permanently authenticated on `https://www.goofish.com`.
- **Never attempt to bypass OpenCLI's Page evaluate or spawn duplicate headless Chrome instances or one-off scrapers.**

## In-Browser Execution Gotchas & Writing Back
1. **Virtual List Downward Scrolling (`inbox.js`)**:
   - The contact list on `/im` is virtualized via Ant Design (`.rc-virtual-list-holder`).
   - Setting `holder.scrollTop` alone does NOT trigger React re-renders. Always call `holder.dispatchEvent(new Event('scroll', { bubbles: true }))` after stepping `scrollTop += 350`.
2. **Reverse Message Container Upward Scrolling (`messages.js`)**:
   - The message list container `#msg-list-container` uses reverse scrolling. Setting `container.scrollTop = 0` and dispatching a `scroll` event triggers earlier message loading.
3. **Session Reset Rule**:
   - When searching for a contact in `messages.js` or `chat.js`, always reset `holder.scrollTop = 0` before beginning the search loop, otherwise contacts above the current scroll offset will be unmounted.
4. **Column Integrity & Convention Audit**:
   - Every key returned in the command function MUST be declared in the `columns` array (`opencli convention-audit goofish` must remain 0 violations).
   - Never use silent clamping (`Math.min`); throw `ArgumentError` on invalid parameters.
5. **Transport deadline vs multi-navigation commands (`seller.js`, `recommend.js`, deep scrolls)**:
   - OpenCLI has **two** independent command timeouts. `OPENCLI_BROWSER_COMMAND_TIMEOUT` (env, default 60s) raises only the CLI-layer runner. The daemon *transport* deadline is a separate hard **120s** (`DEFAULT_COMMAND_TIMEOUT_SECONDS` in `dist/src/browser/daemon-client.js`), and a caller can lift it **only** if the adapter declares a `timeout` arg — `readUserTimeoutSeconds` requires `cmd.args.some(a => a.name === 'timeout')`, otherwise `--timeout`/`OPENCLI_BROWSER_COMMAND_TIMEOUT` never reach the transport.
   - Consequence: `seller` on a heavy seller (item page → seller profile → SKU scroll → reviews) can genuinely exceed 120s and die with `TIMEOUT: … timed out after 120s; it may still complete in the browser`. Measured 2026-09-03 on a live, logged-in listing. If you need to lift the cap, add a `timeout` positional/option to the adapter's `args`; do not paper over it with the env var, which cannot reach this layer.
6. **MV3 service-worker flap during a pending extension self-update**:
   - When Chrome has staged a newer OpenCLI Browser Bridge on disk (e.g. `1.0.24`) while the running worker is still the old version (`1.0.23`), Chrome periodically recycles the worker to apply the update. Short single-page commands (`whoami`, `search`, `detail`) land in a healthy window and pass; long multi-navigation commands span a recycle and fail with `Browser connection dropped after the navigate command was dispatched; it may have completed`.
   - The tell is `opencli daemon status` printing `Extension update available: vX → vY`. A `opencli daemon restart` and even a full Chrome relaunch do **not** force the update. Fix: open `chrome://extensions`, toggle the OpenCLI extension off then on (or click the Developer-mode Update button). Do not read intermittent drops as adapter bugs.

## Verification Gate
Before claiming any modification complete, run:
```bash
npm test
```
and verify the modified command with OpenCLI:
```bash
/Users/vecsatfoxmailcom/.hermes/node/bin/opencli xianyu <command_name> [args] -f table
```
`npm test` (`node --check` + drift guard) is browser-free and always runnable. Live verification of **long** commands (`seller`, `recommend`, deep scrolls) additionally requires a healthy bridge — see gotchas 5–6; if the worker is flapping on a pending update, resolve that first rather than treating a dropped connection as a code failure.
