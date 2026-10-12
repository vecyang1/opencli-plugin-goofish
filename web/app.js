/**
 * Goofish Ops Web Dashboard Client Application
 * Follows Zero-Facade Invariant:
 * - 0 dummy setTimeout, 0 dead clicks, 0 mock arrays
 * - 100% real DB round-trip surviving page refresh
 * - Reactive SSE subscription with auto-reconnect
 */

// State Store
const state = {
  activeTab: 'tab-queue',
  stats: {},
  tasks: [],
  candidates: [],
  historyData: { records: [], summary: {} },
  rulesCatalog: [],
  sseConnected: false,
};

// Toast notification helper
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${type === 'success' ? '✅' : (type === 'error' ? '❌' : 'ℹ️')}</span> <span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Formatters
function formatPrice(val) {
  if (val === undefined || val === null || val === '') return '-';
  const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/[^\d.]/g, ''));
  if (isNaN(num)) return '-';
  return `¥${num.toFixed(2)}`;
}

function formatDate(isoStr) {
  if (!isoStr) return '待首次扫描';
  const d = new Date(isoStr);
  return d.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// 1. Tab Navigation
function initTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-tab');
      switchTab(targetId);
    });
  });
}

function switchTab(targetId) {
  state.activeTab = targetId;
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === targetId);
  });
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === targetId);
  });

  // Lazy load data for active tab
  if (targetId === 'tab-queue') loadTasks();
  if (targetId === 'tab-feed') loadFeed();
  if (targetId === 'tab-history') loadHistory();
  if (targetId === 'tab-inspector') loadRules();
}

// 2. Real-Time SSE Subscription
function initSSE() {
  const statusPill = document.getElementById('sseStatusPill');
  const statusText = document.getElementById('sseStatusText');

  const evtSource = new EventSource('/api/events');

  evtSource.onopen = () => {
    state.sseConnected = true;
    statusPill.style.borderColor = 'rgba(16, 185, 129, 0.4)';
    statusPill.style.background = 'rgba(16, 185, 129, 0.15)';
    statusPill.style.color = 'var(--accent-green)';
    statusText.textContent = '实时同步已连接';
  };

  evtSource.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.type === 'connected') return;

      // When DB mutation occurs, refresh state
      loadStats();
      if (state.activeTab === 'tab-queue') loadTasks(false);
      if (state.activeTab === 'tab-feed') loadFeed(false);
      if (state.activeTab === 'tab-history') loadHistory(false);
    } catch (err) {}
  };

  evtSource.onerror = () => {
    state.sseConnected = false;
    statusPill.style.borderColor = 'rgba(244, 63, 94, 0.4)';
    statusPill.style.background = 'rgba(244, 63, 94, 0.15)';
    statusPill.style.color = 'var(--accent-rose)';
    statusText.textContent = '实时连接断开，正在重连...';
  };
}

// 3. Stats Loader
async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    const json = await res.json();
    if (!json.success) return;

    state.stats = json.stats;
    document.getElementById('tickerTasks').textContent = json.stats.total_tasks || 0;
    document.getElementById('tickerSpikes').textContent = json.stats.total_below_target || 0;
    document.getElementById('tickerCandidates').textContent = json.stats.candidates_stored || 0;
    document.getElementById('tickerHistory').textContent = json.stats.price_history_stored || 0;

    document.getElementById('statTotalTasks').textContent = json.stats.total_tasks || 0;
    document.getElementById('statActiveTasks').textContent = json.stats.active_tasks || 0;
    document.getElementById('statAlertingTasks').textContent = json.stats.alerting_tasks || 0;
    document.getElementById('statTotalSpotted').textContent = json.stats.total_spotted || 0;

    document.getElementById('badgeQueueCount').textContent = json.stats.total_tasks || 0;
  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

// 4. Monitoring Tasks CRUD
async function loadTasks(showLoading = true) {
  const tbody = document.getElementById('tasksTableBody');
  if (showLoading) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; color: var(--text-muted); padding: 30px;">正在加载监控任务...</td></tr>';
  }

  const statusFilter = document.getElementById('filterTaskStatus').value;
  const keywordFilter = document.getElementById('searchTaskKeyword').value.trim();

  const params = new URLSearchParams();
  if (statusFilter) params.append('status', statusFilter);
  if (keywordFilter) params.append('keyword', keywordFilter);

  try {
    const res = await fetch(`/api/tasks?${params.toString()}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || '获取任务失败');

    state.tasks = json.tasks;
    document.getElementById('badgeQueueCount').textContent = json.tasks.length;

    if (json.tasks.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; color: var(--text-muted); padding: 40px;">暂无匹配的监控任务，请点击上方“新建监控任务”添加</td></tr>';
      return;
    }

    tbody.innerHTML = json.tasks.map(t => {
      let statusBadge = '<span class="badge badge-green">🟢 监控中</span>';
      if (t.status === 'paused') statusBadge = '<span class="badge badge-gray">⚪ 已暂停</span>';
      if (t.status === 'alerting') statusBadge = '<span class="badge badge-red">🚨 发现低价</span>';

      const toggleAction = t.status === 'paused' ? 'resume' : 'pause';
      const toggleLabel = t.status === 'paused' ? '恢复' : '暂停';
      const toggleClass = t.status === 'paused' ? 'btn-primary' : 'btn-secondary';

      return `
        <tr data-task-id="${t.task_id}">
          <td>${statusBadge}</td>
          <td>
            <div style="font-weight: 600; color: #fff;">${t.keyword}</div>
            <div style="font-size: 11px; color: var(--text-muted);">${t.category || 'other'} · ${t.notes || '无备注'}</div>
          </td>
          <td style="font-weight: 700; color: var(--accent-rose);">${formatPrice(t.target_price)}</td>
          <td style="color: var(--text-muted);">${formatPrice(t.price_floor)}</td>
          <td style="font-weight: 600; color: var(--accent-cyan);">${formatPrice(t.current_low_price)}</td>
          <td style="font-weight: 700; color: var(--accent-green);">${formatPrice(t.historical_low_price)}</td>
          <td>${t.total_spotted_count || 0} 次</td>
          <td>
            ${t.below_target_count > 0 
              ? `<span class="badge badge-red">🔥 ${t.below_target_count} 次</span>` 
              : '<span style="color: var(--text-muted);">0 次</span>'}
          </td>
          <td style="font-size: 12px; color: var(--text-muted);">${formatDate(t.last_checked_at)}</td>
          <td style="text-align: right; white-space: nowrap;">
            <button class="btn btn-sm ${toggleClass}" onclick="toggleTaskStatus('${t.task_id}', '${toggleAction}')">${toggleLabel}</button>
            <button class="btn btn-sm btn-secondary" onclick="scanTaskNow('${t.task_id}')">立即扫描</button>
            <button class="btn btn-sm btn-secondary" onclick="openEditTaskModal('${t.task_id}')">编辑</button>
            <button class="btn btn-sm btn-danger" onclick="deleteTask('${t.task_id}')">删除</button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    showToast(`加载任务失败: ${err.message}`, 'error');
  }
}

// Global window actions for inline HTML triggers
window.toggleTaskStatus = async (taskId, action) => {
  const newStatus = action === 'resume' ? 'active' : 'paused';
  try {
    const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    showToast(`任务已${action === 'resume' ? '恢复监控' : '暂停'}`, 'success');
    loadTasks(false);
    loadStats();
  } catch (err) {
    showToast(`操作失败: ${err.message}`, 'error');
  }
};

window.scanTaskNow = async (taskId) => {
  try {
    showToast('正在执行即时比价扫描与历史底价对账...', 'info');
    const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    showToast(`扫描完成！检查了 ${json.scan_summary.candidates_checked} 个候选，发现 ${json.scan_summary.new_alerts} 个低价提醒`, 'success');
    loadTasks(false);
    loadStats();
  } catch (err) {
    showToast(`扫描失败: ${err.message}`, 'error');
  }
};

window.deleteTask = async (taskId) => {
  if (!confirm('确定要删除该监控任务吗？删除后将停止对其价格追踪。')) return;
  try {
    const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
      method: 'DELETE',
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    showToast('任务已删除', 'success');
    loadTasks(false);
    loadStats();
  } catch (err) {
    showToast(`删除失败: ${err.message}`, 'error');
  }
};

window.openEditTaskModal = (taskId) => {
  const task = state.tasks.find(t => t.task_id === taskId);
  if (!task) return;

  document.getElementById('modalTaskTitle').textContent = '编辑低价监控任务';
  document.getElementById('formTaskId').value = task.task_id;
  document.getElementById('formKeyword').value = task.keyword;
  document.getElementById('formCategory').value = task.category || '';
  document.getElementById('formTargetPrice').value = task.target_price || '';
  document.getElementById('formPriceFloor').value = task.price_floor || '';
  document.getElementById('formRequire').value = task.require_keywords || '';
  document.getElementById('formExclude').value = task.exclude_keywords || '';
  document.getElementById('formInterval').value = task.interval_sec || 1800;
  document.getElementById('formStatus').value = task.status || 'active';
  document.getElementById('formNotes').value = task.notes || '';

  document.getElementById('taskModal').classList.add('open');
};

// Modal Open/Close Controls
function initModals() {
  const modal = document.getElementById('taskModal');
  const btnOpen = document.getElementById('btnOpenNewTaskModal');
  const btnClose = document.getElementById('btnModalClose');
  const btnCancel = document.getElementById('btnModalCancel');
  const form = document.getElementById('taskForm');

  btnOpen.addEventListener('click', () => {
    document.getElementById('modalTaskTitle').textContent = '新建低价监控任务';
    form.reset();
    document.getElementById('formTaskId').value = '';
    document.getElementById('formInterval').value = '1800';
    document.getElementById('formStatus').value = 'active';
    modal.classList.add('open');
  });

  const closeModal = () => modal.classList.remove('open');
  btnClose.addEventListener('click', closeModal);
  btnCancel.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  // Handle Form Submission (Create or Update)
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const taskId = document.getElementById('formTaskId').value;
    const isEdit = Boolean(taskId);

    const payload = {
      keyword: document.getElementById('formKeyword').value.trim(),
      category: document.getElementById('formCategory').value,
      target_price: parseFloat(document.getElementById('formTargetPrice').value) || 0,
      price_floor: parseFloat(document.getElementById('formPriceFloor').value) || 0,
      require_keywords: document.getElementById('formRequire').value.trim(),
      exclude_keywords: document.getElementById('formExclude').value.trim(),
      interval_sec: parseInt(document.getElementById('formInterval').value, 10) || 1800,
      status: document.getElementById('formStatus').value,
      notes: document.getElementById('formNotes').value.trim(),
    };

    try {
      const url = isEdit ? `/api/tasks/${encodeURIComponent(taskId)}` : '/api/tasks';
      const method = isEdit ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!json.success) throw new Error(json.error);

      closeModal();
      showToast(isEdit ? '监控任务已更新' : '监控任务创建成功并已写入 SQLite SSOT', 'success');
      loadTasks(false);
      loadStats();
    } catch (err) {
      showToast(`保存失败: ${err.message}`, 'error');
    }
  });
}

// 5. Bargain Feed
async function loadFeed(showLoading = true) {
  const grid = document.getElementById('feedGrid');
  if (showLoading) {
    grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 40px;">正在加载候选宝贝 Feed...</div>';
  }

  const category = document.getElementById('filterFeedCategory').value;
  const sort = document.getElementById('sortFeed').value;
  const spikesOnly = document.getElementById('checkFeedSpikesOnly').checked;

  const params = new URLSearchParams();
  if (category) params.append('category', category);
  if (sort) params.append('sort', sort);
  params.append('limit', '60');

  try {
    const res = await fetch(`/api/candidates?${params.toString()}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error);

    state.candidates = json.candidates;
    document.getElementById('badgeFeedCount').textContent = json.candidates.length;

    let items = json.candidates;
    if (spikesOnly) {
      // Find tasks target prices
      const taskTargets = new Map(state.tasks.map(t => [t.category, t.target_price]));
      items = items.filter(it => {
        const target = taskTargets.get(it.category);
        return target && it.price_num <= target;
      });
    }

    if (items.length === 0) {
      grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 50px;">暂无匹配的候选记录</div>';
      return;
    }

    grid.innerHTML = items.map(it => {
      let tagBadge = '<span class="badge badge-cyan">📊 常规在售</span>';
      if (it.price_num < 1650 && it.category === 'nexg2_nylon') {
        tagBadge = '<span class="badge badge-red">🔥 捡漏低价突刺</span>';
      }

      let sellerBadge = '<span class="badge badge-gray">待沟通</span>';
      if (it.seller_status === 'responsive') sellerBadge = '<span class="badge badge-green">✅ 活跃报价</span>';
      if (it.seller_status === 'ghosted') sellerBadge = '<span class="badge badge-amber">⚠️ 曾已读不回</span>';
      if (it.seller_status === 'unfit') sellerBadge = '<span class="badge badge-red">❌ 明确无货</span>';

      return `
        <div class="feed-card">
          <div class="feed-card-header">
            <div class="feed-price">${it.price}</div>
            <div>${tagBadge}</div>
          </div>
          <div class="feed-title">
            <a href="${it.item_url}" target="_blank" rel="noopener noreferrer" class="feed-title-link">
              ${it.title} ↗
            </a>
          </div>
          <div class="feed-meta">
            <span>👤 卖家: ${it.seller}</span>
            <span>📍 ${it.location || '全国'}</span>
            <span>成色: ${it.condition || '95新'}</span>
            <span>状态: ${sellerBadge}</span>
          </div>
          <div class="feed-defect">
            🔍 质检: ${it.defect_notes || '成色完好，待多图质检'}
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    showToast(`加载 Feed 失败: ${err.message}`, 'error');
  }
}

// 6. Price History & Trends
async function loadHistory(showLoading = true) {
  const kw = document.getElementById('historyKeywordSelect').value;
  const tbody = document.getElementById('historyTableBody');
  const barsContainer = document.getElementById('priceDistributionBars');

  if (showLoading) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 25px;">正在加载走势与底价分析...</td></tr>';
    barsContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 13px;">分析中...</div>';
  }

  try {
    const res = await fetch(`/api/history?keyword=${encodeURIComponent(kw)}&limit=50`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error);

    state.historyData = json;
    const summary = json.summary || {};

    document.getElementById('historyLowestPrice').textContent = summary.lowestPrice ? `¥${summary.lowestPrice}` : '-';
    document.getElementById('historyAveragePrice').textContent = summary.averagePrice ? `¥${summary.averagePrice}` : '-';
    document.getElementById('historyMedianPrice').textContent = summary.medianPrice ? `¥${summary.medianPrice}` : '-';
    document.getElementById('historyBelowTargetCount').textContent = `${summary.belowTargetCount || 0} 次`;

    // Render price distribution visual bar
    if (summary.distribution && summary.distribution.length > 0) {
      const maxCount = Math.max(...summary.distribution.map(d => d.count), 1);
      barsContainer.innerHTML = summary.distribution.map(d => {
        const pct = Math.round((d.count / maxCount) * 100);
        return `
          <div style="display: flex; align-items: center; gap: 10px; font-size: 12px;">
            <div style="width: 110px; color: var(--text-muted); text-align: right;">${d.range}</div>
            <div style="flex: 1; background: var(--bg-input); border-radius: 4px; height: 16px; overflow: hidden; border: 1px solid var(--border-color);">
              <div style="width: ${pct}%; background: linear-gradient(90deg, #38bdf8, #818cf8); height: 100%; border-radius: 3px;"></div>
            </div>
            <div style="width: 50px; font-weight: 600; color: #fff;">${d.count} 次</div>
          </div>
        `;
      }).join('');
    } else {
      barsContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 13px;">暂无足够历史样本分布</div>';
    }

    if (!json.records || json.records.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 30px;">暂无该关键词的历史记录</td></tr>';
      return;
    }

    tbody.innerHTML = json.records.map(r => {
      let tagBadge = '<span class="badge badge-cyan">📊 常规标价</span>';
      if (r.price_num === summary.lowestPrice) {
        tagBadge = '<span class="badge badge-green">🏆 历史最低价</span>';
      } else if (r.is_below_target) {
        tagBadge = '<span class="badge badge-red">🔥 低价突刺</span>';
      } else if (r.price_num <= summary.averagePrice * 0.85) {
        tagBadge = '<span class="badge badge-amber">📉 显著偏低</span>';
      }

      return `
        <tr>
          <td style="font-size: 12px; color: var(--text-muted);">${formatDate(r.spotted_at)}</td>
          <td style="font-weight: 700; color: #fff;">${r.price}</td>
          <td>${tagBadge}</td>
          <td>${r.condition || '95新'}</td>
          <td style="font-size: 12px; color: var(--text-muted); max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${r.defect_notes || '-'}
          </td>
          <td>${r.seller || '-'}</td>
          <td style="max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${r.title}
          </td>
          <td style="text-align: right;">
            <a href="${r.item_url}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-secondary">
              查看 ↗
            </a>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    showToast(`查询走势失败: ${err.message}`, 'error');
  }
}

// 7. Diagnostic Inspector ("能读·能试·能调")
async function loadRules() {
  const tbody = document.getElementById('rulesTableBody');
  try {
    const res = await fetch('/api/rules');
    const json = await res.json();
    if (!json.success) return;

    state.rulesCatalog = json.catalog;

    tbody.innerHTML = json.catalog.map(c => `
      <tr>
        <td style="font-weight: 600; color: var(--accent-cyan); font-family: monospace;">${c.id}</td>
        <td><span class="badge badge-purple">${c.archetype}</span></td>
        <td>${c.description}</td>
        <td style="font-family: monospace; color: var(--text-main);">${c.default_query}</td>
        <td style="font-weight: 700; color: var(--accent-rose);">${formatPrice(c.price_floor)}</td>
        <td style="font-size: 12px; color: var(--text-muted);">${c.aliases.join(', ') || '-'}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Failed to load rules:', err);
  }
}

async function runDiagnosis() {
  const title = document.getElementById('diagTitle').value.trim();
  const price = parseFloat(document.getElementById('diagPrice').value) || 0;
  const category = document.getElementById('diagCategory').value;
  const targetPrice = parseFloat(document.getElementById('diagTargetPrice').value) || 0;
  const exclude = document.getElementById('diagExclude').value.trim();
  const require = document.getElementById('diagRequire').value.trim();

  if (!title) {
    showToast('请输入要诊断的商品标题', 'error');
    return;
  }

  try {
    const res = await fetch('/api/diagnose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        price,
        category,
        target_price: targetPrice,
        exclude,
        require,
      }),
    });

    const json = await res.json();
    if (!json.success) throw new Error(json.error);

    // Update verdict badge
    let badgeHtml = '<span class="badge badge-green">📊 常规在售</span>';
    if (json.verdict === 'TRIGGER_ALERT') badgeHtml = '<span class="badge badge-red" style="font-size: 13px; padding: 5px 10px;">🚨 触发低价捡漏告警</span>';
    if (json.verdict === 'REJECT_ACCESSORY') badgeHtml = '<span class="badge badge-gray" style="font-size: 13px; padding: 5px 10px;">🚫 拦截配件杂音</span>';
    if (json.verdict === 'REJECT_PRICE_FLOOR') badgeHtml = '<span class="badge badge-amber" style="font-size: 13px; padding: 5px 10px;">⚠️ 拦截异常低价占位</span>';

    document.getElementById('diagFinalVerdictBadge').innerHTML = badgeHtml;
    document.getElementById('diagActionNotice').innerHTML = `<strong>系统决策建议</strong>: ${json.action}`;

    // Render step-by-step trace stepper
    const stepper = document.getElementById('diagStepper');
    stepper.innerHTML = json.trace.map(s => `
      <div class="step-item ${s.passed ? 'pass' : 'fail'}">
        <div class="step-icon">${s.passed ? '✅' : '❌'}</div>
        <div class="step-body">
          <div class="step-title">步骤 ${s.step}: ${s.name}</div>
          <div style="font-weight: 600; color: ${s.passed ? 'var(--accent-green)' : 'var(--accent-rose)'}; font-size: 12px; margin-top: 2px;">
            ${s.result}
          </div>
          <div class="step-detail">${s.detail}</div>
        </div>
      </div>
    `).join('');

    showToast('规则流水线对账完成', 'success');
  } catch (err) {
    showToast(`诊断失败: ${err.message}`, 'error');
  }
}

function initDiagnostic() {
  document.getElementById('btnRunDiagnosis').addEventListener('click', runDiagnosis);

  // Negative preset button
  document.getElementById('btnFillPresetAccessory').addEventListener('click', () => {
    document.getElementById('diagTitle').value = '恩雅 NEXG 2 代 专用琴包 双肩吉他包 黑色配件';
    document.getElementById('diagPrice').value = '120';
    document.getElementById('diagCategory').value = 'nexg2_nylon';
    document.getElementById('diagTargetPrice').value = '1600';
    runDiagnosis();
  });

  // "能调" Button
  document.getElementById('btnSaveDiagAsTask').addEventListener('click', () => {
    const title = document.getElementById('diagTitle').value.trim();
    const category = document.getElementById('diagCategory').value;
    const targetPrice = document.getElementById('diagTargetPrice').value;
    const exclude = document.getElementById('diagExclude').value;
    const require = document.getElementById('diagRequire').value;

    document.getElementById('modalTaskTitle').textContent = '将诊断规则保存为监控任务';
    document.getElementById('formTaskId').value = '';
    document.getElementById('formKeyword').value = title.slice(0, 30);
    document.getElementById('formCategory').value = category;
    document.getElementById('formTargetPrice').value = targetPrice;
    document.getElementById('formPriceFloor').value = '700';
    document.getElementById('formRequire').value = require;
    document.getElementById('formExclude').value = exclude;
    document.getElementById('formInterval').value = '1800';
    document.getElementById('formStatus').value = 'active';
    document.getElementById('formNotes').value = '从规则诊断器一键创建';

    document.getElementById('taskModal').classList.add('open');
  });
}

// 8. Notion Sync Bridge
function initNotionSync() {
  const btn = document.getElementById('btnTriggerNotionSync');
  const logBox = document.getElementById('notionSyncLog');

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.innerHTML = '<span>⏳</span> 同步中...';
    logBox.textContent = `[${new Date().toLocaleTimeString()}] 开始连接 Notion API...\n[${new Date().toLocaleTimeString()}] 读取 1Password 无人值守凭证 (Antigravity_260528)...`;

    try {
      const res = await fetch('/api/notion/sync', { method: 'POST' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);

      logBox.textContent += `\n[${new Date().toLocaleTimeString()}] ✅ Notion 双向对账同步成功！\n` +
        `-> 数据库 ID: ${json.database_id}\n` +
        `-> 数据库链接: ${json.notion_url}\n` +
        `-> 从 Notion 拉回人工编辑: ${json.pulled_from_notion} 条记录\n` +
        `-> 向 Notion 写入新监控任务: ${json.pushed_new_to_notion} 个\n` +
        `-> 更新 Notion 任务与底价指标: ${json.updated_in_notion} 个\n` +
        `-> 耗时: ${json.duration_ms}ms\n` +
        `-> 完成时间: ${json.synced_at}\n\n` +
        `[系统] 数据库状态已达成一致，下一次自动轮询将无缝承接。`;

      showToast('Notion 数据库双向同步完成！', 'success');
      loadStats();
      loadTasks(false);
    } catch (err) {
      logBox.textContent += `\n[${new Date().toLocaleTimeString()}] ❌ 同步失败: ${err.message}`;
      showToast(`Notion 同步失败: ${err.message}`, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span>🚀</span> 立即执行双向同步';
    }
  });
}

// 9. App Bootstrapper
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initModals();
  initDiagnostic();
  initNotionSync();
  initSSE();

  // Filter bindings
  document.getElementById('filterTaskStatus').addEventListener('change', () => loadTasks());
  document.getElementById('searchTaskKeyword').addEventListener('input', () => loadTasks());
  document.getElementById('btnRefreshTasks').addEventListener('click', () => loadTasks());

  document.getElementById('filterFeedCategory').addEventListener('change', () => loadFeed());
  document.getElementById('sortFeed').addEventListener('change', () => loadFeed());
  document.getElementById('checkFeedSpikesOnly').addEventListener('change', () => loadFeed());
  document.getElementById('btnRefreshFeed').addEventListener('click', () => loadFeed());

  document.getElementById('historyKeywordSelect').addEventListener('change', () => loadHistory());
  document.getElementById('btnRefreshHistory').addEventListener('click', () => loadHistory());

  // Initial data load
  loadStats();
  loadTasks();
});
