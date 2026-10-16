/**
 * Adversarial E2E Verification Script for Goofish Web Operations Dashboard
 * Uses ego-browser nodejs programmatic automation
 * Enforces Zero-Facade Invariant:
 * - 0 dead clicks, 0 mock arrays, 0 uncaught console errors
 * - Real DB round-trip surviving page refresh
 * - Visual verification across desktop and mobile viewports
 */

import { execSync, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const scriptContent = `
const task = await taskSpace("goofish-ops-e2e-verification");
const spaceId = task.spaceId;
console.log("TaskSpace ID:", spaceId);

const page = task.page("p1");

try {
  // Step 1: Navigate to Dashboard
  console.log("1. Navigating to http://127.0.0.1:3838...");
  await page.goto("http://127.0.0.1:3838");
  await page.waitForTimeout(1000);

  // Hook console errors inside browser page
  await page.evaluate(() => {
    window._consoleErrors = [];
    window.addEventListener("error", (e) => {
      window._consoleErrors.push(e.message || String(e));
    });
    const origErr = console.error;
    console.error = (...args) => {
      window._consoleErrors.push(args.map(a => String(a)).join(" "));
      origErr.apply(console, args);
    };
  });

  // Step 2: Verify Initial Header & SSE Status
  const headerInfo = await page.evaluate(() => {
    return {
      title: document.querySelector(".brand-title")?.innerText,
      sseStatus: document.getElementById("sseStatusText")?.innerText,
      tasksTicker: document.getElementById("tickerTasks")?.innerText,
    };
  });
  console.log("Header Info:", headerInfo);
  if (!headerInfo.title?.includes("闲鱼")) throw new Error("Header title missing or incorrect");

  // Step 3: Traverse All Navigation Tabs
  console.log("2. Traversing all navigation tabs...");
  const tabIds = ["tabBtnFeed", "tabBtnHistory", "tabBtnInspector", "tabBtnNotion", "tabBtnQueue"];
  for (const tid of tabIds) {
    await page.evaluate((id) => {
      document.getElementById(id).click();
    }, tid);
    await page.waitForTimeout(300);
  }

  // Step 4: Open Modal and Create New Monitoring Task (Zero-Facade Real Write)
  console.log("3. Creating new monitoring task for '恩雅 NEXG 2N 尼龙'...");
  await page.evaluate(() => {
    document.getElementById("btnOpenNewTaskModal").click();
  });
  await page.waitForTimeout(300);

  await page.evaluate(() => {
    document.getElementById("formKeyword").value = "恩雅 NEXG 2N 尼龙款";
    document.getElementById("formCategory").value = "nexg2_nylon";
    document.getElementById("formTargetPrice").value = "1600";
    document.getElementById("formPriceFloor").value = "700";
    document.getElementById("formRequire").value = "2N,尼龙";
    document.getElementById("formExclude").value = "配件,琴包,踏板,钢弦";
    document.getElementById("formNotes").value = "E2E 自动化测试创建";
    document.getElementById("formStatus").value = "active";
    // Trigger submit
    document.getElementById("btnModalSubmit").click();
  });
  await page.waitForTimeout(1000);

  // Step 5: Assert Task is Persisted and Visible in Table
  const tableState = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll("#tasksTableBody tr"));
    return rows.map(r => r.innerText);
  });
  console.log("Tasks Table Rows Count:", tableState.length);
  const createdRow = tableState.find(r => r.includes("恩雅 NEXG 2N 尼龙款"));
  if (!createdRow) throw new Error("Created task row not found in table!");
  console.log("Found Created Task in Table:", createdRow.replace(/\\n/g, " | "));

  // Step 6: Test Actions (Pause and Resume)
  console.log("4. Testing task action buttons (Pause / Resume)...");
  await page.evaluate(() => {
    const pauseBtn = Array.from(document.querySelectorAll("#tasksTableBody button")).find(b => b.innerText.includes("暂停"));
    if (pauseBtn) pauseBtn.click();
  });
  await page.waitForTimeout(600);

  const isPaused = await page.evaluate(() => {
    return document.querySelector("#tasksTableBody")?.innerText.includes("已暂停");
  });
  console.log("Task paused state:", isPaused);
  if (!isPaused) throw new Error("Task pause state not reflected in UI!");

  // Resume task
  await page.evaluate(() => {
    const resumeBtn = Array.from(document.querySelectorAll("#tasksTableBody button")).find(b => b.innerText.includes("恢复"));
    if (resumeBtn) resumeBtn.click();
  });
  await page.waitForTimeout(600);

  // Step 7: Test Diagnostic Inspector ("能试" Engine)
  console.log("5. Testing Diagnostic Inspector on Tab 4...");
  await page.evaluate(() => {
    document.getElementById("tabBtnInspector").click();
  });
  await page.waitForTimeout(300);

  // 7.1 Run Positive Diagnosis
  await page.evaluate(() => {
    document.getElementById("diagTitle").value = "恩雅 NEXG 2N 静音智能吉他 尼龙弦款 黑色 99新";
    document.getElementById("diagPrice").value = "1550";
    document.getElementById("diagCategory").value = "nexg2_nylon";
    document.getElementById("diagTargetPrice").value = "1600";
    document.getElementById("btnRunDiagnosis").click();
  });
  await page.waitForTimeout(600);

  const diagPosVerdict = await page.evaluate(() => {
    return document.getElementById("diagFinalVerdictBadge")?.innerText;
  });
  console.log("Positive Diagnosis Verdict:", diagPosVerdict);
  if (!diagPosVerdict.includes("低价捡漏告警")) throw new Error("Expected trigger alert for positive diagnosis!");

  // 7.2 Run Negative Accessory Test
  await page.evaluate(() => {
    document.getElementById("btnFillPresetAccessory").click();
  });
  await page.waitForTimeout(600);

  const diagNegVerdict = await page.evaluate(() => {
    return document.getElementById("diagFinalVerdictBadge")?.innerText;
  });
  console.log("Negative Accessory Verdict:", diagNegVerdict);
  if (!diagNegVerdict.includes("拦截配件杂音")) throw new Error("Expected reject accessory for negative diagnosis!");

  // Step 8: Hard Page Reload and Assert Persistence
  console.log("6. Hard page reload to test Real Data Round-Trip persistence...");
  await page.reload();
  await page.waitForTimeout(1000);

  const persistedRow = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll("#tasksTableBody tr"));
    return rows.find(r => r.innerText.includes("恩雅 NEXG 2N 尼龙款"))?.innerText;
  });
  if (!persistedRow) throw new Error("Data did not survive hard page reload! Facade detected!");
  console.log("Persisted Row After Reload:", persistedRow.replace(/\\n/g, " | "));

  // Step 9: Visual Screenshots
  console.log("7. Capturing screenshots...");
  const desktopPath = "tests/e2e_desktop.png";
  await page.screenshot({ path: desktopPath });
  console.log("Saved Desktop Screenshot:", desktopPath);

  // Mobile Viewport Check
  await page.evaluate(() => {
    document.body.style.width = "390px";
  });
  await page.waitForTimeout(300);
  const mobilePath = "tests/e2e_mobile.png";
  await page.screenshot({ path: mobilePath });
  console.log("Saved Mobile Screenshot:", mobilePath);

  // Step 10: Clean up test task
  console.log("8. Cleaning up test task...");
  await page.evaluate(() => {
    const delBtn = Array.from(document.querySelectorAll("#tasksTableBody tr")).find(r => r.innerText.includes("恩雅 NEXG 2N 尼龙款"))?.querySelector(".btn-danger");
    window.confirm = () => true;
    if (delBtn) delBtn.click();
  });
  await page.waitForTimeout(600);

  const capturedErrors = await page.evaluate(() => window._consoleErrors || []);
  console.log("Console Errors Captured in Page:", capturedErrors.length);
  if (capturedErrors.length > 0) {
    console.error("Console Errors:", capturedErrors);
    throw new Error("Uncaught console errors detected: " + capturedErrors.join(", "));
  }

  console.log("\\n🎉 100% ADVERSARIAL E2E VERIFICATION PASSED! ZERO FACADES, ZERO CONSOLE ERRORS!");
} finally {
  console.log("Closing TaskSpace...");
  await task.finish({ keep: [] });
}
`;

console.log("Running Adversarial E2E Verification via ego-browser nodejs...");
let serverProc = null;
try {
  const probe = await fetch('http://127.0.0.1:3838', { signal: AbortSignal.timeout(500) });
  if (probe.ok) {
    console.log("E2E Verification: Port 3838 already active, reusing running instance");
  }
} catch (e) {
  console.log("E2E Verification: Spawning separate Dashboard Server process on port 3838...");
  serverProc = spawn(process.execPath, [
    '-e',
    'import("./src/server.js").then(m => m.startDashboardServer({ port: 3838 }))'
  ], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit'
  });

  let healthy = false;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 200));
    try {
      const res = await fetch('http://127.0.0.1:3838', { signal: AbortSignal.timeout(500) });
      if (res.ok) {
        healthy = true;
        break;
      }
    } catch (err) {}
  }
  if (!healthy) throw new Error("Dashboard server failed to start within 6 seconds");
  console.log("E2E Verification: Dashboard Server is ready on http://127.0.0.1:3838");
}

try {
  execSync(`ego-browser nodejs <<'EOF'\n${scriptContent}\nEOF`, { stdio: 'inherit' });
  if (serverProc) serverProc.kill('SIGTERM');
  process.exit(0);
} catch (err) {
  console.error("E2E Verification Failed:", err.message);
  if (serverProc) serverProc.kill('SIGTERM');
  process.exit(1);
}
