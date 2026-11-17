import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { checkAuth, dismissBaxiaDialog, AuthRequiredError } from '../clis/goofish/_shared.js';

function makeMockPage({ url = 'https://www.goofish.com/personal', elements = {}, bodyText = '', spies = {} }) {
  return {
    tryNativeDrag: spies.tryNativeDrag,
    tryNativeClick: spies.tryNativeClick,
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
          // Support attribute substring checks like iframe[src*="passport.goofish.com"]
          if (selector.includes('passport.goofish.com') || selector.includes('login.m.taobao.com')) {
            const iframes = elements.iframe || [];
            const found = iframes.find(f => {
              const s = String(f.src || '');
              return s.includes('passport.goofish.com') || s.includes('login.m.taobao.com');
            });
            if (found) return found;
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

test('Auth Guard: rejects /search page embedding passport.goofish.com mini_login iframe despite background feed', async () => {
  const searchWithLoginModal = makeMockPage({
    url: 'https://www.goofish.com/search?q=nexg%202n',
    elements: {
      iframe: [{
        src: 'https://passport.goofish.com/mini_login.htm?appName=xianyu',
        getBoundingClientRect: () => ({ width: 856, height: 454, left: 100, top: 100 }),
      }],
      'a[href*="/personal"]': [],
    },
    bodyText: '登录 订单 发闲置 消息',
  });

  await assert.rejects(
    () => checkAuth(searchWithLoginModal),
    (err) => err instanceof AuthRequiredError || err.exitCode === 77
  );
});

test('Baxia Guard: dismissBaxiaDialog ignores mini_login and xdomain-storage iframes', async () => {
  let dragged = false;
  let clicked = false;
  const pageWithLoginIframe = makeMockPage({
    url: 'https://www.goofish.com/search?q=nexg',
    elements: {
      iframe: [{
        src: 'https://passport.goofish.com/mini_login.htm',
        getBoundingClientRect: () => ({ width: 856, height: 454, left: 100, top: 100 }),
      }],
    },
    spies: {
      tryNativeDrag: async () => { dragged = true; },
      tryNativeClick: async () => { clicked = true; },
    },
  });

  await dismissBaxiaDialog(pageWithLoginIframe);
  assert.equal(dragged, false);
  assert.equal(clicked, false);
});

test('Adapter Contract Gate: watch.js and search.js enforce unconditional checkAuth before SSOT write', () => {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  for (const rel of ['clis/goofish/watch.js', 'clis/goofish/search.js']) {
    const src = fs.readFileSync(path.join(root, rel), 'utf-8');
    assert.match(src, /await\s+checkAuth\s*\(\s*page\s*\)/, `${rel} must invoke await checkAuth(page)`);
    assert.doesNotMatch(
      src,
      /if\s*\(\s*!Array\.isArray\(items\)\s*\|\|\s*items\.length\s*===\s*0\s*\)\s*\{\s*await\s+checkAuth/,
      `${rel} must NOT gate checkAuth behind items.length === 0`
    );
  }
});
