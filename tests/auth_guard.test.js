import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  checkAuth,
  dismissBaxiaDialog,
  getGoofishPageState,
  AuthRequiredError,
} from '../clis/goofish/_shared.js';

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

test('Baxia Guard: ordinary listing text does not spoof a security challenge', async () => {
  const page = makeMockPage({
    url: 'https://www.goofish.com/item?id=100000000010',
    bodyText: '商品说明：该设备支持安全验证，并提供验证码登录说明。',
  });

  assert.equal(await getGoofishPageState(page), 'ok');
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

test('Doctor & Bridge Contract Gate: xy-chat doctor probes search Baxia gate and polls bridge readiness', () => {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const cliSrc = fs.readFileSync(path.join(root, 'bin/xy-chat.js'), 'utf-8');
  assert.match(cliSrc, /isProfile38BridgeConnected/, 'bin/xy-chat.js must poll bridge readiness after launch');
  assert.match(cliSrc, /runOpenCli\('search'/, 'bin/xy-chat.js doctor must probe /search Baxia auth gate');
  assert.match(cliSrc, /!authOk \|\| !searchOk/, 'bin/xy-chat.js doctor must fail non-zero when /search is Baxia-gated');
  assert.match(cliSrc, /res\.status === 77[\s\S]*runOpenCli\('whoami'/, 'bin/xy-chat.js watch must probe whoami before retrying transient exit 77');
});

test('Auth Guard Hydration Retry: recovers when xdomain-storage hydrates after initial shell without masking real logouts', async () => {
  let evalCount = 0;
  const hydratingPage = {
    evaluate: async (fn) => {
      evalCount += 1;
      const prevWindow = globalThis.window;
      const prevDocument = globalThis.document;
      globalThis.window = { location: { href: 'https://www.goofish.com/personal' } };
      const isHydrated = evalCount >= 2;
      globalThis.document = {
        body: { innerText: isHydrated ? '编辑资料 18 粉丝 11 关注' : '登录 首页' },
        querySelectorAll: (selector) => {
          if (selector.includes('a[href*="/personal"]')) {
            return [{ innerText: isHydrated ? '测试用户' : '登录', children: [] }];
          }
          if (selector.includes('button, a, span')) {
            return [{ innerText: isHydrated ? '测试用户' : '登录', children: [] }];
          }
          return [];
        },
        querySelector: () => null,
      };
      try {
        return fn();
      } finally {
        globalThis.window = prevWindow;
        globalThis.document = prevDocument;
      }
    },
  };

  const ok = await checkAuth(hydratingPage, { allowHydrationRetry: true, hydrationWaitSec: 0.01 });
  assert.equal(ok, true);
  assert.equal(evalCount, 2);

  const trulyLoggedOut = makeMockPage({
    url: 'https://www.goofish.com/personal',
    elements: {
      'a[href*="/personal"]': [{ innerText: '登录', children: [] }],
      'button, a, span': [{ innerText: '登录', children: [] }],
    },
    bodyText: '登录 首页',
  });
  await assert.rejects(
    () => checkAuth(trulyLoggedOut, { allowHydrationRetry: true, hydrationWaitSec: 0.01 }),
    (err) => err instanceof AuthRequiredError || err.exitCode === 77
  );
});
