import { AuthRequiredError } from '@jackwener/opencli/errors';

/**
 * Check if a navigation error is transient and retriable in Chrome CDP / OpenCLI bridge.
 */
export function isRetriableNavigationError(error) {
  const msg = String(error?.message || error);
  return /Navigation rejected|Detached while handling command|Debugger is not attached|Target closed|Session closed|Cannot access a chrome-extension/i.test(msg);
}

/**
 * Resilient page navigation with automatic retry and location.href evaluation fallback.
 * Solves the frequent 'Navigation rejected.' CDP issue on heavy web pages.
 */
export async function safeGoto(page, url, options = {}) {
  const waitSec = options.waitSec ?? 3.5;
  try {
    await page.goto(url);
    await page.wait(waitSec);
    return;
  } catch (error) {
    if (!isRetriableNavigationError(error)) {
      throw error;
    }
  }

  // First fallback: evaluate location.href in the active page context
  try {
    if (typeof page.evaluate === 'function') {
      await page.evaluate((targetUrl) => {
        if (window.location.href !== targetUrl) {
          window.location.href = targetUrl;
        }
      }, url);
      await page.wait(waitSec + 1);
      return;
    }
  } catch (evalError) {
    // Secondary fallback: wait and retry goto
    await page.wait(1.5);
    await page.goto(url);
    await page.wait(waitSec);
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
