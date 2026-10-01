import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError } from '@jackwener/opencli/errors';
import { safeGoto, checkAuth } from './_shared.js';

export const command = cli({
  site: 'goofish',
  name: 'relist',
  access: 'write',
  description: '重新上架闲鱼下架宝贝 (将已下架宝贝恢复为在售状态)',
  domain: 'www.goofish.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'id', positional: true, required: true, help: '闲鱼商品 ID (如: 1089657928967)' },
    { name: 'submit', type: 'bool', default: false, help: '确认执行重新上架操作' },
  ],
  columns: [
    'item_id',
    'status',
    'action',
    'title',
    'message',
  ],
  func: async (page, kwargs) => {
    let itemId = String(kwargs.id || kwargs._?.[0] || '').trim();
    if (itemId.startsWith('http')) {
      try {
        itemId = new URL(itemId).searchParams.get('id') || itemId;
      } catch (e) {}
    }
    if (!itemId) {
      throw new ArgumentError('必须指定要重新上架的闲鱼商品 ID');
    }

    const shouldSubmit = Boolean(kwargs.submit);
    const targetUrl = `https://www.goofish.com/item?id=${itemId}`;
    await safeGoto(page, targetUrl);
    await checkAuth(page);
    await page.wait(2.5);

    const checkResult = await page.evaluate(async (shouldSubmit) => {
      const title = document.title ? document.title.replace(/_闲鱼$/, '').trim() : '闲鱼宝贝';

      const sellerButtons = Array.from(document.querySelectorAll('div[class*="sellerButton--"], button')).filter(el => {
        const t = (el.innerText || '').trim();
        return t === '下架' || t === '重新上架' || t === '上架' || t === '删除';
      });

      const offlineBtn = sellerButtons.find(b => (b.innerText || '').trim() === '下架');
      const relistBtn = sellerButtons.find(b => {
        const t = (b.innerText || '').trim();
        return t === '重新上架' || t === '上架';
      });

      if (!offlineBtn && !relistBtn) {
        return {
          ok: false,
          state: 'not_owner_or_not_found',
          title,
          message: '未在商品详情页找到卖家管理按钮。请确认当前登录账号是否为该宝贝卖家。',
        };
      }

      if (offlineBtn && !relistBtn) {
        return {
          ok: true,
          state: 'already_on_sale',
          title,
          message: '商品当前已处于在售状态，无需重复上架。',
        };
      }

      if (!shouldSubmit) {
        return {
          ok: true,
          state: 'preview',
          title,
          message: `[预览] 找到宝贝「${title}」重新上架入口。请加 --submit 参数确认上架。`,
        };
      }

      // Execute click on relist button
      relistBtn.click();
      return {
        ok: true,
        state: 'click_dispatched',
        title,
        message: '已点击重新上架按钮，等待确认弹窗...',
      };
    }, shouldSubmit);

    if (!checkResult.ok) {
      return [{
        item_id: itemId,
        status: 'failed',
        action: 'relist',
        title: checkResult.title || '-',
        message: checkResult.message,
      }];
    }

    if (!shouldSubmit || checkResult.state === 'already_on_sale') {
      return [{
        item_id: itemId,
        status: checkResult.state,
        action: 'relist',
        title: checkResult.title,
        message: checkResult.message,
      }];
    }

    // Handle AntD confirm modal
    await page.wait(1.5);
    const modalResult = await page.evaluate(async () => {
      const modalButtons = Array.from(document.querySelectorAll('.ant-modal button, div[class*="modal"] button')).filter(el => {
        const t = (el.innerText || '').trim();
        return t === '确定' || t === '确认' || t === '上架' || t === '我知道了';
      });

      if (modalButtons.length > 0) {
        modalButtons[modalButtons.length - 1].click();
        return { confirmed: true, modalText: modalButtons.map(b => b.innerText.trim()).join(' | ') };
      }
      return { confirmed: false, modalText: 'none' };
    });

    await page.wait(2.5);

    // Verify post-relist state
    const verifyResult = await page.evaluate(() => {
      const sellerButtons = Array.from(document.querySelectorAll('div[class*="sellerButton--"], button')).map(b => (b.innerText || '').trim());
      const isNowOnSale = sellerButtons.includes('下架');
      return { isNowOnSale, currentButtons: sellerButtons.join(' | ') };
    });

    return [{
      item_id: itemId,
      status: verifyResult.isNowOnSale ? 'success' : 'submitted',
      action: 'relist',
      title: checkResult.title,
      message: verifyResult.isNowOnSale
        ? '宝贝已成功恢复在售！页面状态已显示「下架」管理按钮。'
        : `已提交重新上架申请 (弹窗确认: ${modalResult.confirmed ? '已点击' : '未弹出'})`,
    }];
  },
});
