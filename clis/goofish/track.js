import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError } from '@jackwener/opencli/errors';
import { 
  saveMonitoringTask, 
  queryMonitoringTasks, 
  getMonitoringTask, 
  updateMonitoringTask, 
  deleteMonitoringTask 
} from './_db.js';
import { inferCategory, getProductSpec } from './_contract.js';

export const command = cli({
  site: 'goofish',
  name: 'track',
  access: 'read',
  description: '监控任务队列管理 (添加/查询/暂停/恢复/删除闲鱼低价监控目标)',
  domain: 'www.goofish.com',
  strategy: Strategy.LOCAL,
  browser: false,
  args: [
    { name: 'query', positional: true, required: false, help: '监控关键词 (如 nexg 2n 尼龙 或 绿联 15375)' },
    { name: 'target-price', type: 'str', help: '目标捡漏价/报警阈值 (低于此价格报警，如 1600)' },
    { name: 'price-floor', type: 'str', help: '最低有效价格地板 (低于此价格判定为配件杂音，如 700)' },
    { name: 'max-price', type: 'str', help: '最高价格上限' },
    { name: 'category', type: 'str', help: '归一化品类 (如 nexg2_nylon / ugreen_hub)' },
    { name: 'require', type: 'str', help: '必须包含的正向词 (如 尼龙,2N)' },
    { name: 'exclude', type: 'str', help: '自定义排除词 (如 踏板,琴包,配件,钢弦)' },
    { name: 'interval', type: 'int', default: 1800, help: '监控轮询间隔秒数 (默认 1800 秒 / 30分钟)' },
    { name: 'webhook', type: 'str', help: '自定义 Webhook 回调地址' },
    { name: 'list', type: 'bool', default: false, help: '列出所有监控任务' },
    { name: 'status', type: 'str', help: '按状态过滤 (active | paused | alerting)' },
    { name: 'delete', type: 'str', help: '删除指定任务 ID' },
    { name: 'pause', type: 'str', help: '暂停指定任务 ID' },
    { name: 'resume', type: 'str', help: '恢复指定任务 ID' },
    { name: 'notes', type: 'str', help: '操作员备注/核对注记' },
  ],
  columns: [
    'task_id',
    'status',
    'keyword',
    'category',
    'target_price',
    'current_low',
    'historical_low',
    'spotted_count',
    'below_target',
    'last_checked',
  ],
  func: async (first, second) => {
    const kwargs = (second && typeof second === 'object' && !second.isContext) ? second : (first || {});

    // 1. Delete task action
    if (kwargs.delete) {
      const taskId = String(kwargs.delete).trim();
      const ok = deleteMonitoringTask(taskId);
      if (!ok) throw new ArgumentError(`未找到任务 ID: ${taskId}`);
      return [{
        task_id: taskId,
        status: '🗑️ 已删除',
        keyword: '-',
        category: '-',
        target_price: '-',
        current_low: '-',
        historical_low: '-',
        spotted_count: '-',
        below_target: '-',
        last_checked: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      }];
    }

    // 2. Pause task action
    if (kwargs.pause) {
      const taskId = String(kwargs.pause).trim();
      const updated = updateMonitoringTask(taskId, { status: 'paused' });
      if (!updated) throw new ArgumentError(`未找到任务 ID: ${taskId}`);
      return [formatTaskRow(updated)];
    }

    // 3. Resume task action
    if (kwargs.resume) {
      const taskId = String(kwargs.resume).trim();
      const updated = updateMonitoringTask(taskId, { status: 'active' });
      if (!updated) throw new ArgumentError(`未找到任务 ID: ${taskId}`);
      return [formatTaskRow(updated)];
    }

    const rawPos = kwargs.query || kwargs._?.[0] || '';
    const targetPriceStr = kwargs['target-price'] || null;

    // 4. Create new monitoring task
    if (rawPos && targetPriceStr !== null) {
      const targetPrice = parseFloat(String(targetPriceStr).replace(/[^\d.]/g, '')) || 0;
      const spec = getProductSpec(kwargs.category || rawPos);
      const category = kwargs.category ? String(kwargs.category).trim() : (spec ? spec.category : inferCategory({ keyword: rawPos }));
      const priceFloor = kwargs['price-floor'] ? parseFloat(String(kwargs['price-floor']).replace(/[^\d.]/g, '')) : (spec ? spec.priceFloor : 0);
      const maxPrice = kwargs['max-price'] ? parseFloat(String(kwargs['max-price']).replace(/[^\d.]/g, '')) : 0;

      const created = saveMonitoringTask({
        keyword: String(rawPos).trim(),
        category,
        target_price: targetPrice,
        price_floor: priceFloor,
        max_price: maxPrice,
        require_keywords: kwargs.require ? String(kwargs.require).trim() : '',
        exclude_keywords: kwargs.exclude ? String(kwargs.exclude).trim() : '',
        interval_sec: Math.max(60, Number(kwargs.interval) || 1800),
        webhook_url: kwargs.webhook ? String(kwargs.webhook).trim() : '',
        notes: kwargs.notes ? String(kwargs.notes).trim() : '',
        status: 'active',
      });

      return [formatTaskRow(created)];
    }

    // 5. Query / List monitoring tasks
    const isListCmd = rawPos.toLowerCase() === 'list' || rawPos.toLowerCase() === 'ls';
    const filterKeyword = isListCmd ? null : (rawPos ? String(rawPos).trim() : null);
    const tasks = queryMonitoringTasks({
      status: kwargs.status ? String(kwargs.status).trim() : null,
      keyword: filterKeyword,
      category: kwargs.category ? String(kwargs.category).trim() : null,
    });

    return tasks.map(formatTaskRow);
  },
});

function formatTaskRow(t) {
  let statusBadge = '🟢 监控中';
  if (t.status === 'paused') statusBadge = '⚪ 已暂停';
  if (t.status === 'alerting') statusBadge = '🚨 发现低价';

  return {
    task_id: t.task_id,
    status: statusBadge,
    keyword: t.keyword,
    category: t.category || '-',
    target_price: t.target_price > 0 ? `¥${t.target_price}` : '-',
    current_low: t.current_low_price > 0 ? `¥${t.current_low_price}` : '-',
    historical_low: t.historical_low_price > 0 ? `¥${t.historical_low_price}` : '-',
    spotted_count: `${t.total_spotted_count} 次`,
    below_target: t.below_target_count > 0 ? `🔥 ${t.below_target_count} 次` : '0 次',
    last_checked: t.last_checked_at ? new Date(t.last_checked_at).toLocaleTimeString('zh-CN', { hour12: false }) : '待首次扫描',
  };
}
