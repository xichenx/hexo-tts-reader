'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');

const { AudioCache } = require('../lib/cache');
const { synthesize, planChunkKeys, prepareSpeechText } = require('../lib/tts');
const { resolveConfig } = require('../lib/config');
const { ReaderPipeline, buildPlayerMarkup } = require('../lib/injector');
const { inspectPost, resolveSource } = require('../lib/inspect');

test('paragraph chunk cache reuses unchanged audio and assembles a new article', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reader-chunks-'));
  try {
    const chunkCache = new AudioCache(path.join(dir, 'chunks'));
    const calls = [];
    class FakeTTS {
      async setMetadata(voice) { this.voice = voice; }
      toStream(text) {
        calls.push({ voice: this.voice, text });
        return { audioStream: Readable.from([Buffer.from(`[${text}]`)]) };
      }
      close() {}
    }
    const opts = { voice: 'en-US-AriaNeural', autoVoice: false, rate: -8,
      pitch: 0, outputFormat: 'audio-24khz-48kbitrate-mono-mp3', chunkSize: 4000,
      timeoutMs: 1000, retries: 0, chunkCache, ttsFactory: FakeTTS };
    const original = 'First paragraph.\nSecond paragraph.';
    const updated = 'First paragraph.\nRevised paragraph.';
    const keys = planChunkKeys(original, opts);
    assert.equal(keys.length, 2);
    assert.equal(prepareSpeechText(original), original);
    const first = await synthesize(original, opts);
    assert.equal(first.toString(), '[First paragraph.][Second paragraph.]');
    assert.equal(calls.length, 2);
    assert.ok(keys.every((key) => chunkCache.has(key)));
    const events = [];
    const second = await synthesize(updated, { ...opts, onChunk: (hit) => events.push(hit) });
    assert.equal(second.toString(), '[First paragraph.][Revised paragraph.]');
    assert.equal(calls.length, 3, 'only the revised paragraph should call TTS');
    assert.deepEqual(events, [true, false]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('site language localizes playback markup and custom labels remain intact', () => {
  const config = resolveConfig({}, 'en-US');
  assert.equal(config.locale, 'en');
  assert.equal(config.buttonLabel, 'Read this article');
  const html = buildPlayerMarkup({ audioUrl: '/audio/x.mp3', position: config.position,
    buttonLabel: config.buttonLabel, postTitle: 'Hello', locale: config.locale });
  assert.match(html, /data-label-playing="Reading"/);
  assert.match(html, /aria-label="Playback progress"/);
  assert.match(html, /aria-label="Back 10 seconds"/);
  assert.equal(resolveConfig({ buttonLabel: 'Listen now' }, 'en').buttonLabel, 'Listen now');
});

test('inspect command shows effective narration and creates only an opt-in local sample', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reader-inspect-'));
  try {
    const sourceDir = path.join(dir, 'source');
    fs.mkdirSync(path.join(sourceDir, '_posts'), { recursive: true });
    fs.writeFileSync(path.join(sourceDir, '_posts', 'demo.md'), [
      '---', 'title: Demo', 'reader:', '  voice: en-US-AriaNeural',
      '  text: Hello Hexo.', '---', 'This is displayed content.'
    ].join('\n'));
    const logs = [];
    const ctx = { base_dir: dir, source_dir: sourceDir,
      config: { root: '/' },
      log: { info: (value) => logs.push(value), warn() {}, error() {} },
      post: { async render(_source, data) { return { ...data, content: `<p>${data.content}</p>` }; } }
    };
    const pipeline = new ReaderPipeline(ctx, resolveConfig({
      pronunciations: { Hexo: 'Hek-so' }
    }), ctx.log);
    let calls = 0;
    pipeline.synthesizeAudio = async () => { calls++; return Buffer.from('PREVIEW-AUDIO'); };
    const result = await inspectPost(ctx, pipeline, '_posts/demo.md');
    assert.equal(result.text, 'Hello Hek-so.');
    assert.equal(calls, 0);
    assert.ok(logs.some((value) => value.includes('final narration')));
    const sample = await inspectPost(ctx, pipeline, '_posts/demo.md', true);
    assert.equal(calls, 1);
    assert.equal(fs.readFileSync(sample.samplePath, 'utf8'), 'PREVIEW-AUDIO');
    assert.equal(pipeline.inspectOnly, false);
    assert.throws(() => resolveSource(ctx, '../secret.md'), /inside the Hexo source/);
    fs.writeFileSync(path.join(dir, 'outside.md'), 'outside');
    fs.symlinkSync(path.join(dir, 'outside.md'), path.join(sourceDir, '_posts', 'linked.md'));
    await assert.rejects(inspectPost(ctx, pipeline, '_posts/linked.md'), /resolve inside/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('build report includes skips and failures without losing per-post reasons', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reader-report-'));
  try {
    const logs = [];
    const ctx = { base_dir: dir, config: { root: '/' },
      log: { info: (value) => logs.push(value), warn: (value) => logs.push(value) } };
    const pipeline = new ReaderPipeline(ctx, resolveConfig({}), ctx.log);
    pipeline.record({ source: '_posts/skip.md' }, 'skipped', 'disabled');
    pipeline.record({ source: '_posts/fail.md' }, 'failed', 'network timeout');
    assert.deepEqual({ ...pipeline.report() }, { skipped: 1, failed: 1 });
    assert.ok(logs.some((line) => line.includes('_posts/fail.md: network timeout')));
    pipeline.beginGeneration();
    assert.deepEqual(pipeline.report(), {});
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('paragraph cache is pruned only when the post set is complete', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reader-chunk-prune-'));
  try {
    const ctx = { base_dir: dir, config: { root: '/' },
      log: { info() {}, warn() {}, error() {} } };
    const pipeline = new ReaderPipeline(ctx, resolveConfig({ autoVoice: false, pruneCache: true }), ctx.log);
    const post = { source: '_posts/example.md', content: '<p>这是一段可以朗读的文章内容。</p>' };
    pipeline.synthesizeAudio = async () => Buffer.from('ARTICLE');
    const stale = 'f'.repeat(40);
    pipeline.chunkCache.write(stale, Buffer.from('STALE'));
    await pipeline.processPost(post);
    pipeline.buildGeneratorOutputs({ posts: [post, { source: '_posts/other.md' }] });
    assert.equal(pipeline.pruneCache(), 0);
    assert.ok(pipeline.chunkCache.has(stale));
    pipeline.buildGeneratorOutputs({ posts: [post] });
    pipeline.pruneCache();
    assert.equal(pipeline.chunkCache.has(stale), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
