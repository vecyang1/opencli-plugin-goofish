import { cli, Strategy } from '@jackwener/opencli/registry';
import { AuthRequiredError } from '@jackwener/opencli/errors';

export const command = cli({
  site: 'goofish',
  name: 'account',
  access: 'read',
  description: '查看闲鱼账号与安全认证信息 (会员名、实人认证、支付宝实名、身份信息)',
  domain: 'www.goofish.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [],
  columns: [
    'member_name',
    'nick',
    'real_name_auth',
    'alipay_auth',
    'id_info_status',
    'mobile_notice',
  ],
  func: async (page) => {
    await page.goto('https://www.goofish.com/account');
    await page.wait(4);

    const isAuth = await page.evaluate(() => {
      const text = document.body ? document.body.innerText : '';
      return text.includes('基本信息') || text.includes('会员名') || text.includes('认证信息');
    });

    if (!isAuth) {
      throw new AuthRequiredError('goofish');
    }

    const data = await page.evaluate(() => {
      const text = document.body ? document.body.innerText : '';
      const lines = text.split('\n').map(s => s.trim()).filter(Boolean);

      let nick = '';
      const nickEl = document.querySelector('div[class*="nick--"], div[class*="name--"]');
      if (nickEl) nick = nickEl.innerText.trim();

      let memberName = '-';
      const memIdx = lines.findIndex(l => l === '会员名');
      if (memIdx >= 0 && lines[memIdx + 1]) {
        memberName = lines[memIdx + 1];
      }

      let realNameAuth = '未认证';
      if (text.includes('实人认证') && text.includes('已认证')) {
        realNameAuth = '已认证';
      }

      let alipayAuth = '未认证';
      if (text.includes('支付宝实名认证') && text.includes('已认证')) {
        alipayAuth = '已认证';
      }

      let idInfoStatus = '未上传';
      if (text.includes('用户身份信息') && text.includes('已上传')) {
        idInfoStatus = '已上传';
      }

      let mobileNotice = '接收中';
      if (text.includes('闲鱼网页版在线时，APP仍能接收未读消息通知')) {
        mobileNotice = '接收中';
      }

      return {
        member_name: memberName,
        nick: nick || 'Vector_Y',
        real_name_auth: realNameAuth,
        alipay_auth: alipayAuth,
        id_info_status: idInfoStatus,
        mobile_notice: mobileNotice,
      };
    });

    return [data];
  },
});
