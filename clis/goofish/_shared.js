import { solveAlibabaCaptcha } from './_captcha.js';

let _AuthRequiredError;
try {
  const errMod = await import('@jackwener/opencli/errors');
  _AuthRequiredError = errMod.AuthRequiredError;
} catch {
  _AuthRequiredError = class AuthRequiredError extends Error {
    constructor(site) {
      super(`Authentication required for ${site}`);
      this.name = 'AuthRequiredError';
      this.exitCode = 77;
    }
  };
}
export const AuthRequiredError = _AuthRequiredError;

/**
 * Check if a navigation error is transient and retriable in Chrome CDP / OpenCLI bridge.
 */
export function isRetriableNavigationError(error) {
  const msg = String(error?.message || error);
  return /Navigation rejected|Detached while handling command|Debugger is not attached|Target closed|Session closed|Cannot access a chrome-extension/i.test(msg);
}

// Rate limiter state tracking last navigation timestamps by endpoint category
const _lastNavTimes = {
  im: 0,
  item: 0,
  search: 0,
  default: 0,
};

export function isTestEnv() {
  return process.env.NODE_ENV === 'test' || 
         process.env.npm_lifecycle_event === 'test' || 
         process.env.GOOFISH_FAST_TEST === '1' ||
         Boolean(process.env.NODE_TEST_CONTEXT);
}

/**
 * Generate human-like random jitter delay between minMs and maxMs.
 */
export async function humanDelay(minMs = 2500, maxMs = 5000) {
  if (isTestEnv()) {
    return 0;
  }
  const delay = Math.floor(minMs + Math.random() * (maxMs - minMs));
  await new Promise(r => setTimeout(r, delay));
  return delay;
}

/**
 * Determine endpoint category for rate limiting.
 */
export function getEndpointCategory(url) {
  const u = String(url || '');
  if (u.includes('/im') || u.includes('/chat')) return 'im';
  if (u.includes('/item') || u.includes('item?id=')) return 'item';
  if (u.includes('/search')) return 'search';
  return 'default';
}

/**
 * Enforce minimum cooldown and human jitter between navigations.
 * Rung 3 Architectural Guard: Prevents silent account bans by Alibaba anti-scraping risk control.
 */
export async function enforceRateLimit(url, options = {}) {
  if (isTestEnv()) {
    return 0;
  }

  const category = getEndpointCategory(url);
  const now = Date.now();
  const lastTime = _lastNavTimes[category] || 0;

  // Minimum intervals: IM (highest risk) >= 5000ms, Item detail >= 3000ms, Search >= 2500ms
  const minIntervals = {
    im: 5500,
    item: 3500,
    search: 2500,
    default: 2000,
  };

  const minInterval = options.minInterval || minIntervals[category] || 2000;
  const elapsed = now - lastTime;

  if (elapsed < minInterval) {
    const waitBase = minInterval - elapsed;
    const jitter = Math.floor(1000 + Math.random() * 2000); // 1-3s random human jitter
    const totalWait = waitBase + jitter;
    await new Promise(r => setTimeout(r, totalWait));
  }

  _lastNavTimes[category] = Date.now();
  return Date.now() - now;
}

/**
 * Detect login and verification pages without interacting with the challenge.
 */
export async function getGoofishPageState(page) {
  if (typeof page.evaluate !== 'function') return 'unknown';
  return page.evaluate(() => {
    const title = (document.title || '').trim();
    const bodyText = (document.body?.innerText || '').replace(/\s+/g, ' ');
    const href = typeof window !== 'undefined'
      ? String(window.location?.href || '')
      : String(globalThis.location?.href || '');
    const url = new URL(href || 'https://www.goofish.com/');
    const isVisible = node => {
      if (!node || node.closest?.('[hidden], [aria-hidden="true"]')) return false;
      const style = typeof getComputedStyle === 'function'
        ? getComputedStyle(node)
        : { display: 'block', visibility: 'visible', opacity: '1' };
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || 1) === 0) {
        return false;
      }
      const rect = typeof node.getBoundingClientRect === 'function'
        ? node.getBoundingClientRect()
        : { width: 1, height: 1 };
      return rect.width > 0 && rect.height > 0;
    };
    const challengeNodes = Array.from(document.querySelectorAll(
      '#nc_1_wrapper, #nc_1_n1z, .nc_scale, #baxia-dialog-content, [class*="captcha"]',
    )).filter(isVisible);
    const challengeIframe = Array.from(document.querySelectorAll('iframe')).filter(isVisible).some(iframe => {
      const attr = name => typeof iframe.getAttribute === 'function'
        ? iframe.getAttribute(name)
        : iframe[name];
      const src = String(attr('src') || '');
      const label = `${attr('title') || ''} ${attr('aria-label') || ''}`;
      return /punish|captcha|verify|_____tmd_____|x5sec/i.test(src)
        || /验证码|滑块|安全验证|captcha/i.test(label);
    });
    const challengeText = [
      title,
      challengeNodes.map(node => node.innerText || '').join(' '),
    ].join(' ');

    if (/(?:^|\/)(?:punish|captcha|verify)(?:\/|$)/i.test(url.pathname)
      || url.searchParams.has('_____tmd_____') || url.searchParams.has('x5sec')
      || /验证码拦截|安全验证|滑块验证|请拖动.*滑块|请按住滑块/.test(challengeText)
      || challengeIframe
      || challengeNodes.some(node => /滑块|验证|captcha/i.test(node.innerText || ''))) {
      return 'blocked';
    }
    if (/(?:^|\/)login(?:\/|$)/i.test(url.pathname)
      || /^(?:登录|登入)(?:\s|[-_—]|$)/.test(title)
      || /扫码登录|密码登录|短信登录/.test(bodyText.slice(0, 500))) {
      return 'login';
    }
    return 'ok';
  });
}

export async function assertGoofishPageUsable(page) {
  let state = await getGoofishPageState(page);
  if (state === 'blocked') {
    const result = await solveAlibabaCaptcha(page, {
      isSolved: async () => (await getGoofishPageState(page)) === 'ok',
    });
    if (result.solved) state = await getGoofishPageState(page);
  }
  if (state === 'blocked') {
    const { CliError } = await import('@jackwener/opencli/errors');
    throw new CliError(
      'SECURITY_BLOCK',
      'Goofish requires manual security verification.',
      'Automatic slider attempts did not clear the challenge. Complete the verification in your browser and rerun the command; it was not retried.',
    );
  }
  if (state === 'login') {
    await checkAuth(page);
  }
}

/**
 * Best-effort Baxia/NoCaptcha dismissal used by commands that intentionally
 * inspect a page without asserting its final state.
 */
export async function dismissBaxiaDialog(page) {
  const state = await getGoofishPageState(page);
  if (state !== 'blocked') return state;
  const result = await solveAlibabaCaptcha(page, {
    isSolved: async () => (await getGoofishPageState(page)) === 'ok',
  });
  return result.solved ? getGoofishPageState(page) : state;
}

/**
 * Resilient page navigation with automatic retry and location.href evaluation fallback.
 * Solves the frequent 'Navigation rejected.' CDP issue on heavy web pages.
 * Automatically throttles and introduces human behavior jitter to prevent anti-bot bans.
 */
export async function safeGoto(page, url, options = {}) {
  // 1. Enforce anti-ban rate limiting and human jitter cooldown
  await enforceRateLimit(url, options);

  const waitSec = options.waitSec ?? 3;
  const settleMs = options.settleMs ?? 2000;

  try {
    await page.goto(url, { settleMs });
    await page.wait(waitSec);
    await assertGoofishPageUsable(page);
    return;
  } catch (error) {
    if (error?.code === 'SECURITY_BLOCK' || error?.name === 'AuthRequiredError') throw error;
    if (!isRetriableNavigationError(error)) {
      // Fallback: evaluate location.href in the active page context
      try {
        if (typeof page.evaluate === 'function') {
          await page.evaluate((targetUrl) => {
            if (window.location.href !== targetUrl) {
              window.location.href = targetUrl;
            }
          }, url);
          await page.wait(waitSec + 1);
          await assertGoofishPageUsable(page);
          return;
        }
      } catch (evalError) {
        if (evalError?.code === 'SECURITY_BLOCK' || evalError?.name === 'AuthRequiredError') throw evalError;
        // Retry with waitUntil none
        await page.wait(1);
        await page.goto(url, { waitUntil: 'none' });
        await page.wait(waitSec);
        await assertGoofishPageUsable(page);
        return;
      }
      throw error;
    }
    // Retry once on retriable navigation error
    await page.wait(1.5);
    await page.goto(url, { settleMs });
    await page.wait(waitSec);
    await assertGoofishPageUsable(page);
  }
}

/**
 * Resilient semantic authentication verification.
 * Strictly verifies real DOM session indicators without any hardcoded usernames.
 */
export async function checkAuth(page, options = {}) {
  const evaluateAuth = () => page.evaluate(() => {
    const url = String(window.location.href || '');
    if (url.includes('login.m.taobao.com') || url.includes('passport.goofish.com') || url.includes('sec.taobao.com')) {
      return false;
    }

    // Embedded mini_login iframe indicates unauthenticated state even when background URL remains /search or /
    const loginIframe = document.querySelector('iframe[src*="passport.goofish.com"], iframe[src*="login.m.taobao.com"]');
    if (loginIframe) {
      return false;
    }

    const loginLabels = new Set(['登录', '立即登录', '扫码登录', '请登录']);

    // 1. Check for genuine logged-in links and profile selectors (exclude logged-out <a href="/personal">登录</a>)
    const personalLinks = Array.from(document.querySelectorAll('a[href*="/personal"], a[href*="personal?userId="]'));
    const hasAuthedPersonalLink = personalLinks.some(el => {
      const t = (el.innerText || '').trim();
      return t.length > 0 && !loginLabels.has(t);
    });
    const profileNodes = Array.from(document.querySelectorAll('div[class*="infoCenter--"], span[class*="nick--"], div[class*="nick--"]'));
    const hasAuthedProfileNode = profileNodes.some(el => {
      const t = (el.innerText || '').trim();
      return t.length > 0 && !loginLabels.has(t);
    });
    const hasPersonalLink = hasAuthedPersonalLink || hasAuthedProfileNode;

    // 2. Check for trade/order navigation markers
    const hasTradeNav = Boolean(
      document.querySelector('a[href*="/bought"], a[href*="/im"]') ||
      document.querySelector('div[class*="conversation-item--"]')
    );

    // 3. Check for specific logged-out indicators
    const bodyText = document.body ? document.body.innerText : '';
    const hasLoginButton = Array.from(document.querySelectorAll('button, a, span')).some(el => {
      const t = el.innerText ? el.innerText.trim() : '';
      return loginLabels.has(t) && el.children.length === 0;
    });

    if (hasLoginButton && !hasPersonalLink) {
      return false;
    }

    // 4. Check for core page markers
    const hasKeywords = (
      bodyText.includes('编辑资料') ||
      bodyText.includes('我的闲鱼') ||
      bodyText.includes('我的交易') ||
      bodyText.includes('我买到的') ||
      (bodyText.includes('消息') && bodyText.includes('发闲置')) ||
      (bodyText.includes('基本信息') && bodyText.includes('会员名'))
    );

    return hasPersonalLink || (hasTradeNav && hasKeywords);
  });

  let isAuthed = await evaluateAuth();

  // Cold-wake SPA hydration grace window: xdomain-storage / MTOP session may lag 2-4s behind settleMs on dormant tabs
  if (!isAuthed && (!isTestEnv() || options.allowHydrationRetry)) {
    const waitSec = options.hydrationWaitSec ?? 2.5;
    if (typeof page.wait === 'function') {
      await page.wait(waitSec);
    } else {
      await new Promise(r => setTimeout(r, waitSec * 1000));
    }
    isAuthed = await evaluateAuth();
  }

  if (!isAuthed) {
    throw new AuthRequiredError('goofish');
  }

  return true;
}

/**
 * Clean multi-line or whitespace-padded string.
 */
export function cleanText(str) {
  return String(str || '').replace(/\s+/g, ' ').trim();
}
