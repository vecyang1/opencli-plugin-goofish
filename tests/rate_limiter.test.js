import test from 'node:test';
import assert from 'node:assert';
import { 
  getEndpointCategory, 
  humanDelay, 
  enforceRateLimit 
} from '../clis/goofish/_shared.js';

test('Anti-Ban Rate Limiter & Human Behavior Simulation', async (t) => {
  await t.test('correctly classifies endpoint categories for rate limiting', () => {
    assert.equal(getEndpointCategory('https://www.goofish.com/im'), 'im');
    assert.equal(getEndpointCategory('https://www.goofish.com/chat?id=123'), 'im');
    assert.equal(getEndpointCategory('https://www.goofish.com/item?id=1070218779192'), 'item');
    assert.equal(getEndpointCategory('https://www.goofish.com/search?q=nexg'), 'search');
    assert.equal(getEndpointCategory('https://www.goofish.com/personal'), 'default');
  });

  await t.test('humanDelay returns 0 in test environment without delaying', async () => {
    const start = Date.now();
    const d = await humanDelay(1000, 2000);
    const elapsed = Date.now() - start;
    assert.equal(d, 0);
    assert.ok(elapsed < 100, 'Test env must bypass delay to prevent slow tests');
  });

  await t.test('enforceRateLimit returns 0 in test environment without delaying', async () => {
    const start = Date.now();
    const waited = await enforceRateLimit('https://www.goofish.com/im');
    const elapsed = Date.now() - start;
    assert.equal(waited, 0);
    assert.ok(elapsed < 100, 'Test env must bypass delay to prevent slow tests');
  });
});
