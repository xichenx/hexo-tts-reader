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
const { setup } = require('../index');

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

test('setup registers site assets before generation starts', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hexo-reader-int-'));
  try {
    const ctx = makeFakeHexo(dir);
    setup(ctx);
    assert.ok(ctx.extend.injector.getText('head_end').includes(READER_CSS_ROUTE));
    assert.ok(ctx.extend.injector.getText('body_end').includes(READER_JS_ROUTE));
    assert.equal(typeof ctx._filters.after_generate, 'function');
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
    const config = resolveConfig({ cacheDir: 'cache', audioDir: 'audio', autoVoice: false });
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

test('partial build emits unchanged posts audio from cache', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hexo-reader-int-'));
  try {
    const config = resolveConfig({ cacheDir: 'cache', audioDir: 'audio', autoVoice: false });
    const ctx = makeFakeHexo(dir);
    const pipeline = new ReaderPipeline(ctx, config, ctx.log);
    const changed = { source: '_posts/changed.md', content: '<p>这是一篇发生变化的文章。</p>' };
    const unchanged = { source: '_posts/unchanged.md' };
    const { buildKey } = require('../lib/cache');
    const { htmlToReadableText } = require('../lib/extractor');
    const changedKey = buildKey({
      text: htmlToReadableText(changed.content), voice: config.voice,
      rate: config.rate, pitch: config.pitch, format: config.outputFormat
    });
    const unchangedKey = 'b'.repeat(40);
    pipeline.cache.write(changedKey, Buffer.from('CHANGED'));
    pipeline.cache.write(unchangedKey, Buffer.from('UNCHANGED'));
    await pipeline.processPost(changed);

    registerGenerator(ctx, pipeline);
    const outputs = ctx._generators['hexo-reader']({ posts: [changed, unchanged] });
    assert.ok(outputs.some((item) => item.path === `audio/${changedKey}.mp3`));
    assert.ok(outputs.some((item) => item.path === `audio/${unchangedKey}.mp3`));
    assert.equal(pipeline.hasCompletePostSet, false);
    assert.equal(pipeline.pruneCache(), 0);
    assert.ok(pipeline.cache.has(unchangedKey));
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

test('manual-only mode synthesizes only posts with a reader tag', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hexo-reader-int-'));
  try {
    const config = resolveConfig({ cacheDir: 'cache', autoInject: false });
    const ctx = makeFakeHexo(dir);
    const pipeline = new ReaderPipeline(ctx, config, ctx.log);
    let calls = 0;
    pipeline.synthesizeAudio = async () => {
      calls++;
      return Buffer.from('AUDIO');
    };
    const plain = {
      source: '_posts/plain.md', content: '<p>这篇文章没有朗读标签。</p>'
    };
    await pipeline.processPost(plain);
    assert.equal(calls, 0);
    assert.equal(plain._hexoReader, undefined);
    assert.equal(pipeline.entries.size, 0);

    const tagged = {
      source: '_posts/tagged.md',
      content: `<p>这篇文章需要朗读。</p>${PLACEHOLDER}`
    };
    await pipeline.processPost(tagged);
    assert.equal(calls, 1);
    assert.ok(tagged.content.includes('class="hexo-reader"'));
    assert.equal(pipeline.entries.size, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('concurrent posts with identical content share one synthesis', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hexo-reader-int-'));
  try {
    const config = resolveConfig({ cacheDir: 'cache', autoVoice: false });
    const ctx = makeFakeHexo(dir);
    const pipeline = new ReaderPipeline(ctx, config, ctx.log);
    let calls = 0;
    let release;
    pipeline.synthesizeAudio = () => {
      calls++;
      return new Promise((resolve) => {
        release = () => resolve(Buffer.from('SHARED-AUDIO'));
      });
    };
    const content = '<p>两篇文章共用完全相同的朗读内容。</p>';
    const first = { source: '_posts/one.md', content };
    const second = { source: '_posts/two.md', content };

    const firstRun = pipeline.processPost(first);
    const secondRun = pipeline.processPost(second);
    assert.equal(calls, 1);
    release();
    await Promise.all([firstRun, secondRun]);

    assert.equal(first._hexoReader.key, second._hexoReader.key);
    assert.ok(pipeline.cache.has(first._hexoReader.key));
    assert.equal(pipeline.inFlightAudio.size, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('failed synthesis clears its pending task so a later post can retry', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hexo-reader-int-'));
  try {
    const config = resolveConfig({ cacheDir: 'cache', autoVoice: false });
    const ctx = makeFakeHexo(dir);
    const pipeline = new ReaderPipeline(ctx, config, ctx.log);
    let calls = 0;
    pipeline.synthesizeAudio = async () => {
      calls++;
      if (calls === 1) {
        throw new Error('temporary outage');
      }
      return Buffer.from('RETRIED-AUDIO');
    };
    const content = '<p>临时故障恢复后应当可以再次生成。</p>';
    const first = { source: '_posts/one.md', content };
    const second = { source: '_posts/two.md', content };

    await pipeline.processPost(first);
    assert.equal(first._hexoReader, undefined);
    await pipeline.processPost(second);
    assert.equal(calls, 2);
    assert.ok(second._hexoReader.ready);
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
    const config = resolveConfig({ autoVoice: false });
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
