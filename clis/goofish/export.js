import { cli, Strategy } from '@jackwener/opencli/registry';
import { AuthRequiredError } from '@jackwener/opencli/errors';
import fs from 'fs';
import path from 'path';

export const command = cli({
  site: 'goofish',
  name: 'export',
  access: 'read',
  description: '将闲鱼历史订单或收藏夹导出为 Markdown、JSON 或 HTML 格式报表',
  domain: 'www.goofish.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'type', positional: true, required: false, default: 'orders', help: '导出类型: orders (订单) 或 favorites (收藏)' },
    { name: 'output', type: 'str', default: './goofish-export.md', help: '输出文件路径 (.md, .json, .html)' },
    { name: 'limit', type: 'int', default: 100, help: '最大导出条数 (默认 100)' },
    { name: 'file-type', type: 'str', default: 'md', help: '文件格式: md | json | html' },
  ],
  columns: [
    'type',
    'total_exported',
    'output_file',
    'file_size',
    'status',
  ],
  func: async (page, kwargs) => {
    const exportType = String(kwargs.type || 'orders').toLowerCase();
    const limit = Math.max(10, Math.min(Number(kwargs.limit) || 100, 1000));
    let outputPath = String(kwargs.output || (exportType === 'favorites' ? './goofish-favorites.md' : './goofish-orders.md')).trim();
    const format = String(kwargs['file-type'] || (outputPath.endsWith('.json') ? 'json' : outputPath.endsWith('.html') ? 'html' : 'md')).toLowerCase();

    const targetUrl = exportType === 'favorites' ? 'https://www.goofish.com/collection' : 'https://www.goofish.com/bought';
    await page.goto(targetUrl);
    await page.wait(3);

    const isAuth = await page.evaluate(() => {
      const text = document.body ? document.body.innerText : '';
      return text.includes('我买到的') || text.includes('我的收藏') || text.includes('全部') || text.includes('订单');
    });

    if (!isAuth) {
      throw new AuthRequiredError('goofish');
    }

    if (exportType === 'favorites') {
      await page.evaluate(() => {
        const tabs = Array.from(document.querySelectorAll('div, span, button')).filter(el => {
          const t = el.innerText ? el.innerText.trim() : '';
          return t === '全部' && el.children.length === 0;
        });
        if (tabs.length > 0) tabs[0].click();
      });
      await page.wait(2);
    }

    const scrollCycles = Math.ceil(limit / 10);
    for (let s = 0; s < scrollCycles; s++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.wait(1.2);
    }

    let records = [];

    if (exportType === 'favorites') {
      records = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href*="item?id="]'));
        return links.map(a => {
          let itemId = '';
          try { itemId = new URL(a.href, window.location.origin).searchParams.get('id') || ''; } catch (e) {}
          const titleEl = a.querySelector('div[class*="title--"], div[class*="name--"], div[class*="desc--"]');
          let title = titleEl && titleEl.innerText ? titleEl.innerText.trim() : '';
          if (!title) {
            const lines = (a.innerText || '').split('\n').map(s => s.trim()).filter(Boolean);
            const tCand = lines.find(l => !['取消收藏', '我想要', '¥', '￥'].includes(l) && !l.startsWith('¥') && !l.startsWith('￥') && !l.includes('收藏后'));
            title = tCand || lines[0] || '';
          }
          let price = '';
          const pMatch = (a.innerText || '').match(/[¥￥]\s*([\d.]+)/);
          if (pMatch) price = '¥' + pMatch[1];
          return {
            id: itemId,
            title: title.slice(0, 100),
            price: price || '¥0',
            url: a.href,
          };
        });
      });
    } else {
      records = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('div[class*="container--Bhfvcld8"]'));
        return cards.map(card => {
          const sellerLink = card.querySelector('a[href*="personal?userId="]');
          const seller = sellerLink && sellerLink.innerText ? sellerLink.innerText.trim() : '未知卖家';
          const topBar = card.querySelector('div[class*="container--BwkDKCUY"]');
          let statusText = topBar && topBar.innerText ? topBar.innerText.replace(seller, '').replace(/\s+/g, ' ').trim() : '交易完成';

          const itemLink = card.querySelector('a[href*="order-detail?orderId="]') || card.querySelector('a.info--vYR7LJEk');
          let orderId = '';
          if (itemLink && itemLink.href) {
            try { orderId = new URL(itemLink.href, window.location.origin).searchParams.get('orderId') || ''; } catch (e) {}
          }

          const titleEl = card.querySelector('div[class*="name--DMayvjw5"]') || card.querySelector('div[class*="desc--UwIZUPPe"]');
          let title = titleEl && titleEl.innerText ? titleEl.innerText.trim() : '';

          const priceEl = card.querySelector('div[class*="price--GDPxbdMU"]') || card.querySelector('div[class*="price--"]');
          let price = priceEl && priceEl.innerText ? priceEl.innerText.replace(/\s+/g, '') : '';
          if (!price) {
            const pMatch = (card.innerText || '').match(/[¥￥]\s*([\d.]+)/);
            if (pMatch) price = '¥' + pMatch[1];
          }

          return {
            order_id: orderId || '-',
            seller,
            status: statusText,
            title,
            price: price || '¥0',
            order_url: itemLink && itemLink.href ? itemLink.href : '-',
          };
        });
      });
    }

    records = (records || []).slice(0, limit);

    const resolvedPath = path.resolve(process.cwd(), outputPath);
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    let fileContent = '';

    if (format === 'json') {
      fileContent = JSON.stringify({
        export_type: exportType,
        exported_at: new Date().toISOString(),
        total: records.length,
        data: records,
      }, null, 2);
    } else if (format === 'html') {
      const rows = records.map((r, i) => {
        return '<tr><td>' + (i + 1) + '</td><td><b>' + (r.title || '-') + '</b></td><td style="color: #e02020; font-weight: bold;">' + (r.price || '-') + '</td>' + (exportType === 'orders' ? '<td>' + (r.seller || '-') + '</td><td><span class="badge">' + (r.status || '-') + '</span></td>' : '') + '<td>' + (r.order_id || r.id || '-') + '</td></tr>';
      }).join('');

      fileContent = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>闲鱼' + (exportType === 'favorites' ? '宝贝收藏' : '历史订单') + '导出报表</title><style>body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #f8f9fa; padding: 24px; max-width: 1000px; margin: 0 auto; color: #333; } .card { background: #fff; border-radius: 12px; padding: 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); } h2 { margin-top: 0; color: #ff5000; } table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 14px; } th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #eee; } th { background: #fafafa; font-weight: 600; } .badge { background: #f0f0f0; padding: 3px 8px; border-radius: 4px; font-size: 12px; }</style></head><body><div class="card"><h2>🐟 闲鱼' + (exportType === 'favorites' ? '宝贝收藏' : '历史订单') + '导出报表</h2><p>导出时间: ' + new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) + ' | 共计 ' + records.length + ' 条数据</p><table><thead><tr><th>#</th><th>商品标题</th><th>价格</th>' + (exportType === 'orders' ? '<th>卖家</th><th>状态</th>' : '') + '<th>' + (exportType === 'orders' ? '订单号' : '商品ID') + '</th></tr></thead><tbody>' + rows + '</tbody></table></div></body></html>';
    } else {
      const header = '# 🐟 闲鱼' + (exportType === 'favorites' ? '宝贝收藏' : '已买到的宝贝') + '流水记录\n\n- **导出时间:** ' + new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) + '\n- **总计条数:** ' + records.length + '\n\n---\n\n';
      let table = '';
      if (exportType === 'favorites') {
        table = '| # | 商品ID | 商品标题 | 价格 |\n|---|---|---|---|\n' + records.map((r, i) => '| ' + (i + 1) + ' | `' + (r.id || '-') + '` | ' + (r.title || '').replace(/\|/g, '/') + ' | **' + r.price + '** |').join('\n');
      } else {
        table = '| # | 订单号 | 卖家 | 状态 | 商品标题 | 价格 |\n|---|---|---|---|---|---|\n' + records.map((r, i) => '| ' + (i + 1) + ' | `' + (r.order_id || '-') + '` | ' + r.seller + ' | `' + r.status + '` | ' + (r.title || '').replace(/\|/g, '/') + ' | **' + r.price + '** |').join('\n');
      }
      fileContent = header + table + '\n';
    }

    fs.writeFileSync(resolvedPath, fileContent, 'utf-8');
    const stats = fs.statSync(resolvedPath);
    const sizeKb = (stats.size / 1024).toFixed(1) + ' KB';

    return [{
      type: exportType,
      total_exported: records.length,
      output_file: resolvedPath,
      file_size: sizeKb,
      status: '导出成功 (Success)',
    }];
  },
});
