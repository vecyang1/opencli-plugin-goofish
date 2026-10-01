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
 * Dismiss anti-bot Baxia verification dialog if a close button exists, or simulate slider drag.
 */
export async function dismissBaxiaDialog(page) {
  try {
    if (typeof page.evaluate === 'function') {
      await page.evaluate(() => {
        const allDocs = [document];
        document.querySelectorAll('iframe').forEach(f => {
          try {
            if (f.contentDocument) allDocs.push(f.contentDocument);
          } catch (e) {}
        });

        for (const doc of allDocs) {
          // 1. Check for dedicated close button
          const closeEl = doc.querySelector('.baxia-dialog-close, .sufei-dialog-close, [class*="close"], [aria-label*="close" i]');
          if (closeEl && typeof closeEl.click === 'function') {
            const rect = closeEl.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              closeEl.click();
              return;
            }
          }

          // 2. Also look for elements with close glyph
          const glyphs = Array.from(doc.querySelectorAll('button, div, span, a, svg')).filter(el => {
            const txt = (el.innerText || '').trim();
            const cls = typeof el.className === 'string' ? el.className : '';
            return (txt === '×' || txt === '✕' || txt === 'X' || cls.includes('close')) && el.children.length <= 1;
          });
          for (const btn of glyphs) {
            const rect = btn.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              btn.click();
              return;
            }
          }

          // 3. Slider handle drag simulation
          const sliderHandle = doc.querySelector('#nc_1_n1z, .btn_slide, span[class*="btn_slide"], span.nc_iconfont');
          if (sliderHandle) {
            const rect = sliderHandle.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              const startX = rect.left + rect.width / 2;
              const startY = rect.top + rect.height / 2;
              const dispatch = (type, x, y) => {
                const evt = new MouseEvent(type, {
                  bubbles: true,
                  cancelable: true,
                  view: window,
                  clientX: x,
                  clientY: y,
                });
                sliderHandle.dispatchEvent(evt);
              };
              dispatch('mousedown', startX, startY);
              for (let i = 1; i <= 10; i++) {
                dispatch('mousemove', startX + (i * 32), startY + (Math.random() * 2 - 1));
              }
              dispatch('mouseup', startX + 330, startY);
            }
          }
        }
      });
    }

    // 4. Native CDP cross-origin iframe fallback
    if (typeof page.evaluate === 'function') {
      const iframeInfo = await page.evaluate(() => {
        const iframes = Array.from(document.querySelectorAll('iframe'));
        for (const iframe of iframes) {
          const rect = iframe.getBoundingClientRect();
          if (rect.width > 200 && rect.height > 200) {
            return {
              hasIframe: true,
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
            };
          }
        }
        return { hasIframe: false };
      });

      if (iframeInfo?.hasIframe) {
        if (typeof page.tryNativeDrag === 'function') {
          const sliderStartX = Math.round(iframeInfo.left + iframeInfo.width * 0.28);
          const sliderStartY = Math.round(iframeInfo.top + iframeInfo.height * 0.61);
          const sliderEndX = Math.round(iframeInfo.left + iframeInfo.width * 0.78);
          await page.tryNativeDrag({ x: sliderStartX, y: sliderStartY }, { x: sliderEndX, y: sliderStartY });
        }
        if (typeof page.tryNativeClick === 'function') {
          const closeX = Math.round(iframeInfo.left + iframeInfo.width * 0.88);
          const closeY = Math.round(iframeInfo.top + iframeInfo.height * 0.14);
          await page.tryNativeClick(closeX, closeY);
        }
      }
    }
  } catch (e) {}
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
    await dismissBaxiaDialog(page);
    return;
  } catch (error) {
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
          await dismissBaxiaDialog(page);
          return;
        }
      } catch (evalError) {
        // Retry with waitUntil none
        await page.wait(1);
        await page.goto(url, { waitUntil: 'none' });
        await page.wait(waitSec);
        await dismissBaxiaDialog(page);
        return;
      }
      throw error;
    }
    // Retry once on retriable navigation error
    await page.wait(1.5);
    await page.goto(url, { settleMs });
    await page.wait(waitSec);
    await dismissBaxiaDialog(page);
  }
}

/**
 * Resilient semantic authentication verification.
 * Strictly verifies real DOM session indicators without any hardcoded usernames.
 */
export async function checkAuth(page) {
  const isAuthed = await page.evaluate(() => {
    // 1. Check for logged-in links and profile selectors
    const hasPersonalLink = Boolean(
      document.querySelector('a[href*="/personal"], a[href*="personal?userId="]') ||
      document.querySelector('div[class*="infoCenter--"], span[class*="nick--"]')
    );

    // 2. Check for trade/order navigation markers
    const hasTradeNav = Boolean(
      document.querySelector('a[href*="/bought"], a[href*="/im"]') ||
      document.querySelector('div[class*="conversation-item--"]')
    );

    // 3. Check for specific logged-out indicators
    const bodyText = document.body ? document.body.innerText : '';
    const hasLoginButton = Array.from(document.querySelectorAll('button, a, span')).some(el => {
      const t = el.innerText ? el.innerText.trim() : '';
      return (t === '登录' || t === '立即登录' || t === '扫码登录') && el.children.length === 0;
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
