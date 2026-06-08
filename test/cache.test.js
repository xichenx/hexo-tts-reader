'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { AudioCache } = require('../lib/cache');
const { ReaderPipeline } = require('../lib/injector');
const { resolveConfig } = require('../lib/config');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hexo-reader-cache-'));
}

const KEY_A = 'a'.repeat(40);
const KEY_B = 'b'.repeat(40);
const KEY_C = 'c'.repeat(40);

test('prune removes orphan mp3 files and keeps used ones', () => {
  const dir = tmpDir();
  try {
    const cache = new AudioCache(dir);
    cache.write(KEY_A, Buffer.from('A'));
    cache.write(KEY_B, Buffer.from('B'));
    cache.write(KEY_C, Buffer.from('C'));

    const removed = cache.prune(new Set([KEY_A]));

    assert.deepEqual(removed.sort(), [KEY_B, KEY_C].sort());
    assert.ok(cache.has(KEY_A), 'used key should remain');
    assert.ok(!cache.has(KEY_B), 'orphan should be deleted');
    assert.ok(!cache.has(KEY_C), 'orphan should be deleted');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('prune ignores unrelated files but cleans leftover tmp files', () => {
  const dir = tmpDir();
  try {
    const cache = new AudioCache(dir);
    cache.write(KEY_A, Buffer.from('A'));
    const unrelated = path.join(dir, 'README.txt');
    fs.writeFileSync(unrelated, 'keep me');
    const staleTmp = path.join(dir, `${KEY_B}.mp3.123.456.tmp`);
    fs.writeFileSync(staleTmp, 'partial');

    const removed = cache.prune(new Set([KEY_A]));

    assert.deepEqual(removed, []);
    assert.ok(fs.existsSync(unrelated), 'unrelated files must be left alone');
    assert.ok(!fs.existsSync(staleTmp), 'leftover tmp files should be cleaned');
    assert.ok(cache.has(KEY_A));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('prune with empty dir returns empty list', () => {
  const dir = tmpDir();
  try {
    const cache = new AudioCache(dir);
    cache.ensureDir();
    assert.deepEqual(cache.prune(new Set([KEY_A])), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeFakeHexo(baseDir) {
  return {
    base_dir: baseDir,
    config: { root: '/' },
    log: { info() {}, warn() {}, error() {} },
    extend: {
      filter: { register() {} },
      generator: { register() {} },
      tag: { register() {} },
      injector: { register() {} }
    }
  };
}

test('pipeline.pruneCache deletes files not referenced this build', () => {
  const dir = tmpDir();
  try {
    const config = resolveConfig({ cacheDir: 'cache' });
    const ctx = makeFakeHexo(dir);
    const pipeline = new ReaderPipeline(ctx, config, ctx.log);

    pipeline.cache.write(KEY_A, Buffer.from('A'));
    pipeline.cache.write(KEY_B, Buffer.from('B'));
    // Only KEY_A was referenced during this build.
    pipeline.entries.set(KEY_A, { relPath: `audio/${KEY_A}.mp3` });

    const count = pipeline.pruneCache();

    assert.equal(count, 1);
    assert.ok(pipeline.cache.has(KEY_A));
    assert.ok(!pipeline.cache.has(KEY_B));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('pipeline.pruneCache is a no-op when no posts were processed', () => {
  const dir = tmpDir();
  try {
    const config = resolveConfig({ cacheDir: 'cache' });
    const ctx = makeFakeHexo(dir);
    const pipeline = new ReaderPipeline(ctx, config, ctx.log);

    pipeline.cache.write(KEY_A, Buffer.from('A'));
    pipeline.cache.write(KEY_B, Buffer.from('B'));
    // entries empty => likely incremental build, must not wipe the cache.

    const count = pipeline.pruneCache();

    assert.equal(count, 0);
    assert.ok(pipeline.cache.has(KEY_A));
    assert.ok(pipeline.cache.has(KEY_B));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('resolveConfig defaults pruneCache to false and accepts true', () => {
  assert.equal(resolveConfig({}).pruneCache, false);
  assert.equal(resolveConfig({ pruneCache: true }).pruneCache, true);
  assert.equal(resolveConfig({ pruneCache: 'yes' }).pruneCache, false);
});
