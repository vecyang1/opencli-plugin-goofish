import { cli, Strategy } from '@jackwener/opencli/registry';
import { exec } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

async function getStartDashboardServer() {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const candidatePaths = [
    path.resolve(currentDir, '../../src/server.js'),
    path.resolve(currentDir, '../src/server.js'),
    path.resolve(currentDir, './server.js'),
    path.resolve(process.env.HOME || '', 'Documents/A-coding/opencli-plugin-goofish/src/server.js'),
  ];
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      const mod = await import(pathToFileURL(p).href);
      return mod.startDashboardServer;
    }
  }
  throw new Error(`Cannot locate server.js from ${currentDir}`);
}

export const command = cli({
  site: 'goofish',
  name: 'ui',
  access: 'read',
  description: '启动闲鱼低价监控与捡漏管理平台 Web 中控台 (支持人机协同管理、价格走势分析、规则诊断与 Notion 同步)',
  domain: 'www.goofish.com',
  strategy: Strategy.LOCAL,
  browser: false,
  args: [
    { name: 'port', type: 'int', default: 3838, help: 'Web 服务器监听端口 (默认 3838)' },
    { name: 'open', type: 'bool', default: true, help: '启动后自动在默认浏览器中打开页面' },
  ],
  columns: [
    'status',
    'dashboard_url',
    'message',
  ],
  func: async (first, second) => {
    const kwargs = (second && typeof second === 'object' && !second.isContext) ? second : (first || {});
    const port = Number(kwargs.port) || 3838;
    const shouldOpen = kwargs.open !== false;

    const startDashboardServer = await getStartDashboardServer();
    const { url } = await startDashboardServer({ port });

    if (shouldOpen) {
      const openCmd = process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
      exec(openCmd, () => {});
    }

    // Keep process alive if invoked directly from CLI
    return [{
      status: '🟢 运行中',
      dashboard_url: url,
      message: '闲鱼监控与捡漏中控台已启动，按 Ctrl+C 停止服务',
    }];
  },
});
