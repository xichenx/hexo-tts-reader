'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/npm-publish.yml'), 'utf8');
const publishStep = workflow.split('      - name: Publish with token first, OIDC on authentication failure\n')[1];
const script = publishStep.split("          node <<'JS'\n")[1].split('\n          JS')[0].replace(/^ {10}/gm, '');
const ok = { status: 0, stdout: '"maintainer"', stderr: '' };
const failure = code => ({ status: 1, stdout: JSON.stringify({ error: { code } }), stderr: `npm error code ${code}\n` });

function simulate(results, token = 'test-token') {
  const calls = [];
  const output = [];
  const proc = {
    env: { NODE_AUTH_TOKEN: token, ACTIONS_ID_TOKEN_REQUEST_URL: 'https://oidc.example', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'oidc-request' },
    stdout: { write: text => output.push(text) },
    stderr: { write: text => output.push(text) },
  };
  vm.runInNewContext(script, {
    process: proc,
    console: { log: text => output.push(text), error: text => output.push(text) },
    require: name => {
      assert.equal(name, 'node:child_process');
      return { spawnSync: (command, args, options) => {
        assert.equal(command, 'npm');
        calls.push({ args, env: options.env });
        const result = results[calls.length - 1];
        if (!result) throw new Error('Unexpected npm invocation');
        return result;
      } };
    },
  });
  return { calls, status: proc.exitCode || 0, output: output.join('\n') };
}

function assertOIDC(call) {
  assert.equal(call.args[0], 'publish');
  assert.equal(call.env.NODE_AUTH_TOKEN, '');
  assert.equal(call.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN, 'oidc-request');
}

test('valid token publishes once without exposing OIDC to npm', () => {
  const result = simulate([ok, ok]);
  assert.equal(result.status, 0);
  assert.deepEqual(result.calls.map(c => c.args[0]), ['whoami', 'publish']);
  for (const call of result.calls) {
    assert.equal(call.env.NODE_AUTH_TOKEN, 'test-token');
    assert.equal(call.env.ACTIONS_ID_TOKEN_REQUEST_URL, undefined);
    assert.equal(call.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN, undefined);
  }
});

for (const code of ['E401', 'ENEEDAUTH']) {
  test(`${code} during token check switches to OIDC without the token`, () => {
    const result = simulate([failure(code), ok]);
    assert.equal(result.status, 0);
    assert.equal(result.calls.length, 2);
    assertOIDC(result.calls[1]);
  });
}

test('token expiring between identity check and publish falls back', () => {
  const result = simulate([ok, failure('E401'), ok]);
  assert.equal(result.status, 0);
  assertOIDC(result.calls[2]);
});

test('ambiguous E404 requires a fresh failed authentication check', () => {
  const result = simulate([ok, failure('E404'), failure('E401'), ok]);
  assert.equal(result.status, 0);
  assert.equal(result.calls.length, 4);
  assertOIDC(result.calls[3]);
});

test('E404 with a valid token fails without OIDC', () => {
  const result = simulate([ok, failure('E404'), ok]);
  assert.equal(result.status, 1);
  assert.equal(result.calls.length, 3);
});

for (const code of ['E403', 'EOTP', 'EPUBLISHCONFLICT', 'ETIMEDOUT']) {
  test(`${code} during publish is not treated as an expired token`, () => {
    const result = simulate([ok, failure(code)]);
    assert.equal(result.status, 1);
    assert.equal(result.calls.length, 2);
  });
}

test('network failure during token check does not fall back', () => {
  const result = simulate([failure('ECONNRESET')]);
  assert.equal(result.status, 1);
  assert.equal(result.calls.length, 1);
});

test('missing token requires configuration instead of silently selecting OIDC', () => {
  const result = simulate([], '');
  assert.equal(result.status, 1);
  assert.equal(result.calls.length, 0);
});

test('failed OIDC binding stops after one fallback attempt', () => {
  const result = simulate([failure('E401'), failure('E404')]);
  assert.equal(result.status, 1);
  assert.equal(result.calls.length, 2);
});
