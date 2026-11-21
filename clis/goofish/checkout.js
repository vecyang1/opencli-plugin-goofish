import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError, CliError, CommandExecutionError } from '@jackwener/opencli/errors';
import { safeGoto, checkAuth } from './_shared.js';
import { buildGoofishCheckoutPricing } from './_pricing.js';

function formatCheckoutAmount(value) {
  if (!Number.isFinite(value)) return '-';
  return `¥${Number.isInteger(value) ? value : value.toFixed(2)}`;
}

export const command = cli({
  site: 'goofish',
  name: 'checkout',
  access: 'read',
  description: [
    '读取闲鱼验货宝下单预览的价格分项与合计，只读且不提交订单。',
    '金额单位为 CNY。',
    '公式：checkout_preview_total = confirm_price + inspection_fee + postage。',
    'checkout_verified=true 表示合计已与分项对账；preview_only=true 且 is_final_payable=false 表示这是预览，不是最终实付。',
    'JSON 输出另含 promotions_json、price_context、pricing_json 审计字段。',
    'table 输出使用 price_summary 汇总各费用，并以 - 表示接口未提供的值。',
    '错误输出为 {"ok":false,"error":{"code","message","hint","exitCode"}}。成功退出码 0；参数错误 2；登录 77；安全验证和业务/接口错误 1。',
  ].join('\n'),
  example: 'opencli goofish checkout 100000000010 -f json',
  domain: 'www.goofish.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  defaultFormat: 'json',
  args: [
    {
      name: 'id',
      positional: true,
      required: true,
      help: '6-24 位纯数字商品 ID，可从商品链接 https://www.goofish.com/item?id=<id> 获取',
    },
  ],
  columns: [
    'item_id',
    'title_preview',
    'price_summary',
    'checkout_preview_total_display',
    'checkout_verified',
    'preview_only',
    'is_final_payable',
  ],
  func: async (page, kwargs) => {
    const itemId = String(kwargs.id || kwargs._?.[0] || '').trim();
    if (!/^\d{6,24}$/.test(itemId)) {
      throw new ArgumentError(
        '商品 ID 必须是 6-24 位纯数字，例如 100000000010。',
        '从商品链接 https://www.goofish.com/item?id=<id> 中提取 ID。',
      );
    }

    await safeGoto(page, `https://www.goofish.com/create-order-yhb?itemId=${itemId}`);
    await checkAuth(page);
    await page.wait(2);

    const evalResult = await page.evaluate(async targetItemId => {
      if (!window.lib?.mtop?.request) {
        return { ok: false, error: 'window.lib.mtop is unavailable' };
      }
      try {
        const response = await window.lib.mtop.request({
          api: 'mtop.alibaba.idle.pc.yhb.order.create.render',
          data: { itemId: String(targetItemId), useYhb: true },
          type: 'GET',
          v: '1.0',
          dataType: 'json',
          needLogin: false,
          needLoginPC: false,
          sessionOption: 'AutoLoginOnly',
          ecode: 0,
        });
        return { ok: true, response };
      } catch (error) {
        return {
          ok: false,
          error: String(error?.message || error?.msg || error?.code || ''),
          ret: Array.isArray(error?.ret) ? error.ret.map(String) : [],
          hasValidationUrl: Boolean(error?.data?.url || error?.url),
        };
      }
    }, itemId);

    const ret = Array.isArray(evalResult?.response?.ret)
      ? evalResult.response.ret.map(String)
      : [];
    const errorText = [
      evalResult?.error || '',
      ...ret,
      ...(Array.isArray(evalResult?.ret) ? evalResult.ret : []),
    ].join(' ');

    if (/FAIL_SYS_USER_VALIDATE|RGV587_ERROR|captcha|punish/i.test(errorText)
      || evalResult?.hasValidationUrl
      || evalResult?.response?.data?.url) {
      throw new CliError(
        'SECURITY_BLOCK',
        '闲鱼结算预览要求安全验证。',
        '请在浏览器中手动完成验证后重试；命令没有点击确认购买或绕过验证。',
      );
    }
    if (!evalResult?.ok || !ret[0]?.startsWith('SUCCESS')) {
      throw new CommandExecutionError(
        '闲鱼结算预览接口调用失败',
        errorText.slice(0, 240) || 'The checkout preview API returned no success status.',
      );
    }

    const result = buildGoofishCheckoutPricing(evalResult.response, itemId);
    if (!result.response_item_id) {
      throw new CommandExecutionError('闲鱼结算预览缺少商品 ID');
    }
    if (result.response_item_id !== itemId) {
      throw new CommandExecutionError(
        '闲鱼结算预览与请求商品 ID 不一致',
        `Requested ${itemId}, received ${result.response_item_id}.`,
      );
    }
    if (result.checkout_total == null) {
      throw new CommandExecutionError(
        '闲鱼结算预览缺少可验证的合计金额',
        'data.totalAmount was missing or invalid.',
      );
    }
    if (!result.checkout_verified) {
      throw new CommandExecutionError(
        '闲鱼结算预览合计与分项不一致',
        `checkout=${result.checkout_total}, confirm+inspection+postage=${result.checkout_component_total ?? 'unavailable'}, unit_conflicts=${JSON.stringify(result.unit_conflicts)}`,
      );
    }

    return [{
      item_id: result.item_id,
      title: result.title,
      title_preview: result.title.length > 40 ? `${result.title.slice(0, 40)}…` : result.title,
      price_summary: [
        `标价 ${formatCheckoutAmount(result.listing_price)}`,
        `确认 ${formatCheckoutAmount(result.confirm_price)}`,
        `调整 ${formatCheckoutAmount(result.promotion_adjusted_price)}`,
        `优惠 ${formatCheckoutAmount(result.promotion_amount)}`,
        `验货 ${formatCheckoutAmount(result.inspection_fee)}`,
        `运费 ${formatCheckoutAmount(result.postage)}`,
      ].join(' | '),
      listing_price: result.listing_price,
      confirm_price: result.confirm_price,
      activity_price: result.activity_price,
      promotion_adjusted_price: result.promotion_adjusted_price,
      promotion_amount: result.promotion_amount,
      inspection_fee: result.inspection_fee,
      postage: result.postage,
      checkout_preview_total: result.checkout_total,
      checkout_preview_total_display: formatCheckoutAmount(result.checkout_total),
      checkout_verified: result.checkout_verified,
      preview_only: result.preview_only,
      is_final_payable: result.is_final_payable,
      button_disable: result.button_disable,
      promotions_json: JSON.stringify(result.promotions),
      price_source: 'checkout_preview',
      price_context: JSON.stringify(result.pricing.context),
      pricing_json: JSON.stringify(result.pricing),
    }];
  },
});
