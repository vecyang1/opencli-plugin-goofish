import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError } from '@jackwener/opencli/errors';
import { safeGoto, checkAuth } from './_shared.js';

export const command = cli({
  site: 'goofish',
  name: 'delete',
  access: 'write',
  description: '彻底删除闲鱼发布的宝贝 (从个人中心彻底移除，不可撤销)',
  domain: 'www.goofish.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'id', positional: true, required: true, help: '闲鱼商品 ID (如: 1089657928967)' },
    { name: 'submit', type: 'bool', default: false, help: '确认执行永久删除操作' },
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
      throw new ArgumentError('必须指定要删除的闲鱼商品 ID');
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

      const deleteBtn = sellerButtons.find(b => (b.innerText || '').trim() === '删除');

      if (!deleteBtn) {
        return {
          ok: false,
          state: 'not_owner_or_not_found',
          title,
          message: '未在商品详情页找到「删除」按钮。请确认当前登录账号是否为该宝贝卖家。',
        };
      }

      if (!shouldSubmit) {
        return {
          ok: true,
          state: 'preview',
          title,
          message: `⚠️ [高危预警] 找到宝贝「${title}」删除入口。永久删除后不可恢复！请加 --submit 参数确认删除。`,
        };
      }

      // Execute click on delete button
      deleteBtn.click();
      return {
        ok: true,
        state: 'click_dispatched',
        title,
        message: '已点击删除按钮，等待确认弹窗...',
      };
    }, shouldSubmit);

    if (!checkResult.ok) {
      return [{
        item_id: itemId,
        status: 'failed',
        action: 'delete',
        title: checkResult.title || '-',
        message: checkResult.message,
      }];
    }

    if (!shouldSubmit) {
      return [{
        item_id: itemId,
        status: checkResult.state,
        action: 'delete',
        title: checkResult.title,
        message: checkResult.message,
      }];
    }

    // Handle AntD confirm modal
    await page.wait(1.5);
    const modalResult = await page.evaluate(async () => {
      const modalButtons = Array.from(document.querySelectorAll('.ant-modal button, div[class*="modal"] button')).filter(el => {
        const t = (el.innerText || '').trim();
        return t === '确定' || t === '确认' || t === '删除' || t === '我知道了';
      });

      if (modalButtons.length > 0) {
        modalButtons[modalButtons.length - 1].click();
        return { confirmed: true, modalText: modalButtons.map(b => b.innerText.trim()).join(' | ') };
      }
      return { confirmed: false, modalText: 'none' };
    });

    await page.wait(3.0);

    // Verify post-deletion state
    const verifyResult = await page.evaluate(() => {
      const currentUrl = window.location.href;
      const text = document.body ? document.body.innerText : '';
      const isDeletedOrRedirected = /personal/.test(currentUrl) || text.includes('商品已下架或不存在') || text.includes('网络不见了');
      return { isDeletedOrRedirected, currentUrl };
    });

    return [{
      item_id: itemId,
      status: verifyResult.isDeletedOrRedirected ? 'success' : 'submitted',
      action: 'delete',
      title: checkResult.title,
      message: verifyResult.isDeletedOrRedirected
        ? '宝贝已成功永久删除！已从个人中心及闲鱼商城移除。'
        : `已提交删除申请 (弹窗确认: ${modalResult.confirmed ? '已确认' : '未弹出'})`,
    }];
  },
});
