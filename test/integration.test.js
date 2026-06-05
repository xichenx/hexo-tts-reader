'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { ReaderPipeline, READER_JS_ROUTE, READER_CSS_ROUTE } = require('../lib/injector');
const { registerSiteAssets } = require('../lib/injectSiteAssets');
const { registerGenerator } = require('../lib/generator');
const { registerTag, PLACEHOLDER } = require('../lib/tag');
const { resolveConfig } = require('../lib/config');

function makeFakeHexo(baseDir) {
  const filters = {};
  const generators = {};
  const tags = {};
  const injectorStore = { head_end: { default: new Set() }, body_end: { default: new Set() } };
  return {
    base_dir: baseDir,
    config: { root: '/' },
    log: { info() {}, warn() {}, error() {} },
    extend: {
      filter: { register(name, fn) { filters[name] = fn; } },
      generator: { register(name, fn) { generators[name] = fn; } },
      tag: { register(name, fn) { tags[name] = fn; } },
      injector: {
        register(entry, value, to = 'default') {
          const bucket = injectorStore[entry] || injectorStore.head_end;
          if (!bucket[to]) {
            bucket[to] = new Set();
          }
          bucket[to].add(value);
        },
        getText(entry, to = 'default') {
          const set = injectorStore[entry] && injectorStore[entry][to];
          return set ? Array.from(set).join('') : '';
        }
      }
    },
    _filters: filters,
    _generators: generators,
    _tags: tags,
    _injectorStore: injectorStore
  };
}

test('generator emits client assets even without posts', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hexo-reader-int-'));
  try {
    const config = resolveConfig({});
    const ctx = makeFakeHexo(dir);
    const pipeline = new ReaderPipeline(ctx, config, ctx.log);
    registerGenerator(ctx, pipeline);
    registerTag(ctx, config);

    const outputs = ctx._generators['hexo-reader']({});
    const routes = outputs.map((o) => o.path);
    assert.ok(routes.includes(READER_JS_ROUTE), 'reader.js must be emitted');
    assert.ok(routes.includes(READER_CSS_ROUTE), 'reader.css must be emitted');
    const js = outputs.find((o) => o.path === READER_JS_ROUTE);
    assert.ok(js.data.length > 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('tag sets _hexoReaderTagged and emits placeholder', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hexo-reader-int-'));
  try {
    const config = resolveConfig({});
    const ctx = makeFakeHexo(dir);
    registerTag(ctx, config);
    const page = {};
    const out = ctx._tags.reader.call({ page }, []);
    assert.equal(out, PLACEHOLDER);
    assert.equal(page._hexoReaderTagged, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('pipeline reuses cached audio without calling TTS', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hexo-reader-int-'));
  try {
    const config = resolveConfig({ cacheDir: 'cache', audioDir: 'audio' });
    const ctx = makeFakeHexo(dir);
    const pipeline = new ReaderPipeline(ctx, config, ctx.log);

    const post = {
      title: 'hello',
      source: '_posts/hello.md',
      content: '<p>这是一个测试段落，用来验证缓存命中。</p>'
    };

    const { buildKey } = require('../lib/cache');
    const { htmlToReadableText } = require('../lib/extractor');
    const text = htmlToReadableText(post.content);
    const key = buildKey({
      text,
      voice: config.voice,
      rate: config.rate,
      pitch: config.pitch,
      format: config.outputFormat
    });
    pipeline.cache.write(key, Buffer.from('FAKEMP3'));

    await pipeline.processPost(post);

    assert.ok(post._hexoReader && post._hexoReader.ready, 'pipeline should mark ready');
    assert.ok(post.content.includes('class="hexo-reader"'), 'player should be injected');
    assert.ok(post.content.includes(`/audio/${key}.mp3`), 'audio URL should include key');
    assert.ok(!post.content.includes('reader.js'), 'assets should not be inlined in post content');

    registerGenerator(ctx, pipeline);
    const outputs = ctx._generators['hexo-reader']({});
    const audio = outputs.find((o) => o.path === `audio/${key}.mp3`);
    assert.ok(audio, 'generator should emit audio for processed post');
    assert.deepEqual(audio.data, Buffer.from('FAKEMP3'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('pipeline skips when reader=false', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hexo-reader-int-'));
  try {
    const config = resolveConfig({});
    const ctx = makeFakeHexo(dir);
    const pipeline = new ReaderPipeline(ctx, config, ctx.log);
    const post = {
      title: 'x',
      source: '_posts/x.md',
      reader: false,
      content: '<p>hi</p>'
    };
    await pipeline.processPost(post);
    assert.equal(post._hexoReader, undefined);
    assert.equal(post.content, '<p>hi</p>');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('registerSiteAssets injects PJAX-safe global assets', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hexo-reader-int-'));
  try {
    const config = resolveConfig({});
    const ctx = makeFakeHexo(dir);
    registerSiteAssets(ctx, config);

    const head = ctx.extend.injector.getText('head_end', 'default');
    const body = ctx.extend.injector.getText('body_end', 'default');
    assert.ok(head.includes('data-hexo-reader-css'));
    assert.ok(head.includes(READER_CSS_ROUTE));
    assert.ok(body.includes('data-pjax'));
    assert.ok(body.includes('data-hexo-reader-js'));
    assert.ok(body.includes(READER_JS_ROUTE));
    assert.ok(body.includes('hexoReaderBoot'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('placeholder from tag is replaced by player when ready', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hexo-reader-int-'));
  try {
    const config = resolveConfig({});
    const ctx = makeFakeHexo(dir);
    const pipeline = new ReaderPipeline(ctx, config, ctx.log);

    const post = {
      title: 'with-tag',
      source: '_posts/t.md',
      content: `<p>before</p>${PLACEHOLDER}<p>after</p>`
    };

    const { buildKey } = require('../lib/cache');
    const { htmlToReadableText } = require('../lib/extractor');
    const text = htmlToReadableText(post.content);
    const key = buildKey({
      text,
      voice: config.voice,
      rate: config.rate,
      pitch: config.pitch,
      format: config.outputFormat
    });
    pipeline.cache.write(key, Buffer.from('AUDIO'));

    await pipeline.processPost(post);

    assert.ok(!post.content.includes(PLACEHOLDER), 'placeholder should be replaced');
    assert.ok(post.content.includes('class="hexo-reader"'));
    const matches = post.content.match(/class="hexo-reader"/g);
    assert.equal(matches.length, 1, 'only one player should be injected');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
