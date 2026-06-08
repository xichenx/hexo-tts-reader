'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { withRetry } = require('../lib/tts');
const { resolveConfig } = require('../lib/config');

test('withRetry returns immediately on first success', async () => {
  let calls = 0;
  const result = await withRetry(async () => {
    calls += 1;
    return 'ok';
  }, { retries: 3, baseDelayMs: 0 });
  assert.equal(result, 'ok');
  assert.equal(calls, 1);
});

test('withRetry retries until success and reports attempt index', async () => {
  let calls = 0;
  const retried = [];
  const result = await withRetry(async (attempt) => {
    calls += 1;
    if (attempt < 2) {
      throw new Error('boom ' + attempt);
    }
    return attempt;
  }, {
    retries: 3,
    baseDelayMs: 0,
    onRetry: (err, n, delay) => retried.push({ message: err.message, n, delay })
  });
  assert.equal(result, 2);
  assert.equal(calls, 3);
  assert.deepEqual(retried.map((r) => r.n), [1, 2]);
});

test('withRetry applies exponential backoff delays', async () => {
  const delays = [];
  await withRetry(async (attempt) => {
    if (attempt < 3) {
      throw new Error('again');
    }
    return true;
  }, {
    retries: 5,
    baseDelayMs: 10,
    onRetry: (_err, _n, delay) => delays.push(delay)
  });
  // base * 2^attempt for attempts 0,1,2 => 10, 20, 40
  assert.deepEqual(delays, [10, 20, 40]);
});

test('withRetry throws the last error after exhausting retries', async () => {
  let calls = 0;
  await assert.rejects(
    () => withRetry(async () => {
      calls += 1;
      throw new Error('fail ' + calls);
    }, { retries: 2, baseDelayMs: 0 }),
    /fail 3/
  );
  assert.equal(calls, 3);
});

test('withRetry treats non-positive retries as a single attempt', async () => {
  let calls = 0;
  await assert.rejects(
    () => withRetry(async () => {
      calls += 1;
      throw new Error('once');
    }, { retries: 0, baseDelayMs: 0 }),
    /once/
  );
  assert.equal(calls, 1);
});

test('resolveConfig exposes retry defaults and clamps overrides', () => {
  const def = resolveConfig({});
  assert.equal(def.retries, 2);
  assert.equal(def.retryDelayMs, 500);

  const clamped = resolveConfig({ retries: 999, retryDelayMs: -5 });
  assert.equal(clamped.retries, 10);
  assert.equal(clamped.retryDelayMs, 0);

  const floored = resolveConfig({ retries: 3.9 });
  assert.equal(floored.retries, 3);
});
