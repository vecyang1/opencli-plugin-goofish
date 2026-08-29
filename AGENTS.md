> Scope: project-local. Operational rules for agents maintaining opencli-plugin-goofish.

# Agent Instructions: opencli-plugin-goofish

## Single Chokepoint & Transport Architecture
- All commands execute through OpenCLI's browser runtime (`browser: true, navigateBefore: false, strategy: Strategy.COOKIE`).
- The browser instance connects to Chrome Profile 2 where the user is permanently authenticated on `https://www.goofish.com`.
- **Never attempt to bypass OpenCLI's Page evaluate or spawn duplicate headless Chrome instances.**

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
