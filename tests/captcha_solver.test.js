import test from 'node:test';
import assert from 'node:assert';
import { assertGoofishPageUsable } from '../clis/goofish/_shared.js';
import {
  buildSliderTrajectory,
  findCaptchaTargetInPage,
  solveAlibabaCaptcha,
} from '../clis/goofish/_captcha.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const sliderTarget = {
  kind: 'slider',
  start: { x: 50, y: 60 },
  distance: 200,
  viewportWidth: 800,
  viewportHeight: 600,
};

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await new Promise(resolve => setImmediate(resolve));
}

function fakePage(evaluations, { cdp, fallback = 'ok', visibility = 'visible' } = {}) {
  const queue = [...evaluations];
  let currentVisibility = visibility;
  const cdpMock = async (method, params) => {
    const result = cdp ? await cdp(method, params) : undefined;
    if (method === 'Page.bringToFront') currentVisibility = 'visible';
    return result;
  };
  return {
    cdp: cdpMock,
    evaluate: async script => {
      if (script === 'document.visibilityState') return currentVisibility;
      return queue.length ? queue.shift() : fallback;
    },
    wait: async () => {},
  };
}

test('Goofish slider trajectory overshoots with human-like steps', () => {
  const points = buildSliderTrajectory(200, { random: () => 0.5 });
  assert.ok(points.length >= 15 && points.length <= 25);
  assert.ok(points.at(-1).dx >= 360 && points.at(-1).dx <= 420);
  assert.ok(points.every(point => Math.abs(point.dy) <= 3));
  assert.ok(points.every(point => point.delayMs >= 5 && point.delayMs <= 25));
});

test('cross-origin frames are trusted only when they match an Alibaba challenge URL', () => {
  const makeFrame = src => ({
    src,
    contentDocument: null,
    isConnected: true,
    parentElement: null,
    getAttribute: () => src,
    closest: () => null,
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 400, height: 300 }),
  });
  const trusted = makeFrame(
    'https://h5api.m.goofish.com/h5/mtop.example/1.0/_____tmd_____/punish?x5secdata=redacted&action=captcha',
  );
  const untrusted = makeFrame('https://example.invalid/_____tmd_____/punish');
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousLocation = globalThis.location;
  const previousStyle = globalThis.getComputedStyle;
  globalThis.window = { innerWidth: 800, innerHeight: 600 };
  globalThis.location = { href: 'https://www.goofish.com/item?id=100000000010' };
  globalThis.getComputedStyle = () => ({
    display: 'block',
    visibility: 'visible',
    opacity: '1',
  });

  try {
    globalThis.document = {
      querySelectorAll: selector => selector === 'iframe' ? [trusted] : [],
    };
    const hit = findCaptchaTargetInPage();
    assert.equal(hit.kind, 'iframe');
    assert.match(hit.src, /goofish\.com/);

    globalThis.document = {
      querySelectorAll: selector => selector === 'iframe' ? [untrusted] : [],
    };
    assert.equal(findCaptchaTargetInPage().kind, 'none');
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
    globalThis.location = previousLocation;
    globalThis.getComputedStyle = previousStyle;
  }
});

test('a timed-out in-flight press only releases late and never moves or retries', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const press = deferred();
  const events = [];
  let isSolvedCalls = 0;
  let evaluateCalls = 0;
  const page = fakePage([sliderTarget], {
    cdp: async (_method, params) => {
      events.push(params);
      if (params.type === 'mousePressed') return press.promise;
      return undefined;
    },
  });
  const originalEvaluate = page.evaluate;
  page.evaluate = async (...args) => {
    if (args[0] !== 'document.visibilityState') evaluateCalls += 1;
    return originalEvaluate(...args);
  };

  const solving = solveAlibabaCaptcha(page, {
    isSolved: async () => {
      isSolvedCalls += 1;
      return true;
    },
    maxAttempts: 10,
    random: () => 0.5,
  });

  await flushMicrotasks();
  t.mock.timers.tick(60);
  await flushMicrotasks();
  t.mock.timers.tick(8_000);
  await flushMicrotasks();
  t.mock.timers.tick(2_000);
  await flushMicrotasks();

  const result = await solving;
  assert.equal(result.timedOut, true);
  assert.equal(result.solved, false);
  assert.equal(result.attempts, 1);
  assert.equal(result.cleanupUnconfirmed, true);
  assert.equal(isSolvedCalls, 0);
  assert.equal(evaluateCalls, 1);
  assert.equal(events.some(event => event.type === 'mouseMoved' && event.buttons === 1), false);
  assert.equal(events.some(event => event.type === 'mouseReleased'), false);

  press.resolve();
  await flushMicrotasks();
  assert.equal(events.filter(event => event.type === 'mousePressed').length, 1);
  assert.equal(events.filter(event => event.type === 'mouseReleased').length, 1);
  assert.equal(events.some(event => event.type === 'mouseMoved' && event.buttons === 1), false);
  assert.equal(evaluateCalls, 1);
});

test('a failed CDP release never triggers DOM fallback or a solved result', async () => {
  const events = [];
  let evaluateCalls = 0;
  let isSolvedCalls = 0;
  const page = fakePage([sliderTarget], {
    cdp: async (_method, params) => {
      events.push(params);
      if (params.type === 'mouseMoved' && params.buttons === 1) {
        throw new Error('move failed');
      }
      if (params.type === 'mouseReleased') {
        throw new Error('release failed');
      }
      return undefined;
    },
  });
  const originalEvaluate = page.evaluate;
  page.evaluate = async (...args) => {
    if (args[0] !== 'document.visibilityState') evaluateCalls += 1;
    return originalEvaluate(...args);
  };

  const result = await solveAlibabaCaptcha(page, {
    isSolved: async () => {
      isSolvedCalls += 1;
      return true;
    },
    random: () => 0.5,
  });

  assert.equal(result.solved, false);
  assert.equal(result.cleanupUnconfirmed, true);
  assert.equal(isSolvedCalls, 0);
  assert.equal(evaluateCalls, 1);
  assert.equal(events.filter(event => event.type === 'mouseReleased').length, 1);
});

test('assertGoofishPageUsable drags a slider before passing', async () => {
  const calls = [];
  const page = fakePage([
    'blocked',
    { kind: 'slider', start: { x: 50, y: 60 }, distance: 200, viewportWidth: 800, viewportHeight: 600 },
    'ok',
    'ok',
  ], {
    cdp: async (method, params) => { calls.push({ method, params }); },
  });

  await assertGoofishPageUsable(page);

  assert.ok(calls.some(call => call.params?.type === 'mousePressed'));
  assert.ok(calls.some(call => call.params?.type === 'mouseMoved' && call.params?.buttons === 1));
  assert.ok(calls.some(call => call.params?.type === 'mouseReleased'));
});

test('assertGoofishPageUsable brings a hidden tab to the front only after a failed slider attempt', async () => {
  const calls = [];
  const page = fakePage([
    'blocked',
    { kind: 'slider', start: { x: 50, y: 60 }, distance: 200, viewportWidth: 800, viewportHeight: 600 },
    'blocked',
    'blocked',
    { kind: 'slider', start: { x: 50, y: 60 }, distance: 200, viewportWidth: 800, viewportHeight: 600 },
    'ok',
    'ok',
  ], {
    visibility: 'hidden',
    cdp: async (method, params) => { calls.push({ method, type: params?.type }); },
  });

  await assertGoofishPageUsable(page);

  const bringIndex = calls.findIndex(call => call.method === 'Page.bringToFront');
  const pressIndex = calls.findIndex(call => call.type === 'mousePressed');
  assert.ok(bringIndex > pressIndex, 'foreground switch must happen after the first drag attempt');
});

test('assertGoofishPageUsable still throws SECURITY_BLOCK when no supported target appears', async () => {
  const page = fakePage(['blocked', { kind: 'none' }], {
    fallback: 'blocked',
    cdp: async () => {
      throw new Error('no drag should be attempted');
    },
  });
  // A blocked page with no supported widget keeps the existing hard failure.
  await assert.rejects(
    () => assertGoofishPageUsable(page),
    error => error?.code === 'SECURITY_BLOCK',
  );
});

test('OPENCLI_SOLVE_CAPTCHA=0 disables automatic dragging', async () => {
  const previous = process.env.OPENCLI_SOLVE_CAPTCHA;
  process.env.OPENCLI_SOLVE_CAPTCHA = '0';
  try {
    let cdpCalls = 0;
    const page = fakePage(['blocked'], {
      cdp: async () => { cdpCalls += 1; },
    });
    await assert.rejects(
      () => assertGoofishPageUsable(page),
      error => error?.code === 'SECURITY_BLOCK',
    );
    assert.equal(cdpCalls, 0);
  } finally {
    if (previous === undefined) delete process.env.OPENCLI_SOLVE_CAPTCHA;
    else process.env.OPENCLI_SOLVE_CAPTCHA = previous;
  }
});
