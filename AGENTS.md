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

## Verification Gate
Before claiming any modification complete, run:
```bash
npm test
```
and verify the modified command with OpenCLI:
```bash
/Users/vecsatfoxmailcom/.hermes/node/bin/opencli xianyu <command_name> [args] -f table
```
