import test from 'node:test';
import assert from 'node:assert/strict';
import { checkAuth, AuthRequiredError } from '../clis/goofish/_shared.js';

function makeMockPage({ url = 'https://www.goofish.com/personal', elements = {}, bodyText = '' }) {
  return {
    evaluate: async (fn) => {
      const prevWindow = globalThis.window;
      const prevDocument = globalThis.document;
      globalThis.window = { location: { href: url } };
      globalThis.document = {
        body: { innerText: bodyText },
        querySelectorAll: (selector) => {
          const matched = [];
          for (const [key, list] of Object.entries(elements)) {
            if (selector.includes(key)) matched.push(...list);
          }
          return matched;
        },
        querySelector: (selector) => {
          for (const [key, list] of Object.entries(elements)) {
            if (selector.includes(key) && list.length > 0) return list[0];
          }
          return null;
        },
      };
      try {
        return fn();
      } finally {
        globalThis.window = prevWindow;
        globalThis.document = prevDocument;
      }
    },
  };
}

test('Auth Guard: rejects logged-out Goofish DOM containing <a href="/personal">登录</a>', async () => {
  const loggedOutPage = makeMockPage({
    url: 'https://www.goofish.com/personal',
    elements: {
      'a[href*="/personal"]': [{ innerText: '登录', children: [] }],
      'button, a, span': [{ innerText: '登录', children: [] }],
    },
    bodyText: '登录 首页 我的闲鱼',
  });

  await assert.rejects(
    () => checkAuth(loggedOutPage),
    (err) => err instanceof AuthRequiredError || err.exitCode === 77
  );
});

test('Auth Guard: accepts genuine logged-in Goofish DOM with non-login nickname', async () => {
  const loggedInPage = makeMockPage({
    url: 'https://www.goofish.com/personal',
    elements: {
      'a[href*="/personal"]': [{ innerText: '测试买家账号', children: [] }],
      'div[class*="infoCenter--"]': [{ innerText: '16 粉丝 11 关注', children: [] }],
    },
    bodyText: '编辑资料 16 粉丝 11 关注',
  });

  const ok = await checkAuth(loggedInPage);
  assert.equal(ok, true);
});
