'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { resolveConfig, resolvePostConfig } = require('../lib/config');
const { applyPronunciations, prepareNarrationText } = require('../lib/narration');
const { ReaderPipeline, shouldSkipPost } = require('../lib/injector');
const { buildKey } = require('../lib/cache');

test('article voice overrides site routing unless routing is explicit', () => {
  const site = resolveConfig({ rate: -8, pronunciations: { Hexo: '黑克搜' } });
  const fixed = resolvePostConfig(site, { voice: 'zh-CN-YunxiNeural', rate: -12, pitch: 999 });
  assert.equal(fixed.voice, 'zh-CN-YunxiNeural');
  assert.equal(fixed.autoVoice, false);
  assert.equal(fixed.rate, -12);
  assert.equal(fixed.pitch, 100);
  assert.equal(site.voice, 'zh-CN-XiaoxiaoNeural');
  assert.equal(site.rate, -8);

  const routed = resolvePostConfig(site, { voice: 'zh-CN-YunxiNeural', autoVoice: 'article' });
  assert.equal(routed.autoVoice, 'article');
  assert.equal(resolvePostConfig(site, {}).autoVoice, site.autoVoice);
  assert.equal(resolvePostConfig(site, { rate: 'bad' }).rate, site.rate);
  assert.equal(resolvePostConfig(site, { rate: null, pitch: '' }).rate, site.rate);
  assert.equal(resolvePostConfig(site, { rate: null, pitch: '' }).pitch, site.pitch);
});

test('pronunciations use longest exact match, local overrides, and no cascading', () => {
  const site = resolveConfig({ pronunciations: {
    React: '瑞艾克特',
    'React Native': '瑞艾克特 内提夫',
    Hexo: '黑克搜'
  } });
  const post = resolvePostConfig(site, { pronunciations: {
    Hexo: '赫克索',
    '瑞艾克特': '不应二次替换'
  } });
  assert.equal(
    applyPronunciations('React Native 与 Hexo 和 React', post.pronunciations, 100),
    '瑞艾克特 内提夫 与 赫克索 和 瑞艾克特'
  );
  assert.equal(site.pronunciations.find((item) => item.from === 'Hexo').to, '黑克搜');
  assert.equal(applyPronunciations('aaaa', [{ from: 'a', to: '很长' }], 3), '很长很');
});

test('authored speech script replaces HTML extraction and accepts pronunciation rules', () => {
  const site = resolveConfig({ pronunciations: { Hexo: '黑克搜' }, maxTextLength: 100 });
  const post = resolvePostConfig(site, { text: '请听 Hexo。\r\n第二段。' });
  assert.equal(prepareNarrationText('<p>网页文字不应进入音频</p>', post), '请听 黑克搜。\n第二段。');
  assert.equal(prepareNarrationText('<p>网页文字</p>', resolvePostConfig(site, { text: '   ' })), '网页文字');
  assert.equal(prepareNarrationText('<p>Hexo</p>', resolvePostConfig(site, {})), '黑克搜');
});

test('reader enable:false retains the existing per-post opt-out behavior', () => {
  assert.equal(shouldSkipPost({ reader: false }, []), true);
  assert.equal(shouldSkipPost({ reader: { enable: false } }, []), true);
  assert.equal(shouldSkipPost({ reader: { voice: 'test' } }, []), false);
});

test('pipeline synthesizes the final script with article parameters and keys its cache accordingly', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hexo-reader-narration-'));
  try {
    const config = resolveConfig({ cacheDir: 'cache', pronunciations: { Hexo: '黑克搜' } });
    const ctx = {
      base_dir: dir,
      config: { root: '/' },
      log: { info() {}, warn() {}, error() {} }
    };
    const pipeline = new ReaderPipeline(ctx, config, ctx.log);
    const calls = [];
    pipeline.synthesizeAudio = async (text, options) => {
      calls.push({ text, options });
      return Buffer.from('VOICE-AUDIO');
    };
    const post = {
      source: '_posts/custom.md',
      title: 'Custom',
      content: '<p>网页中的原文。</p>',
      reader: {
        text: '欢迎来到 Hexo。',
        voice: 'zh-CN-YunxiNeural',
        rate: -15,
        pitch: 3
      }
    };
    await pipeline.processPost(post);

    assert.equal(calls.length, 1);
    assert.equal(calls[0].text, '欢迎来到 黑克搜。');
    assert.equal(calls[0].options.voice, 'zh-CN-YunxiNeural');
    assert.equal(calls[0].options.autoVoice, false);
    assert.equal(calls[0].options.rate, -15);
    assert.equal(calls[0].options.pitch, 3);
    assert.equal(post._hexoReader.key, buildKey({
      text: '欢迎来到 黑克搜。', voice: 'zh-CN-YunxiNeural',
      rate: -15, pitch: 3, format: config.outputFormat
    }));
    assert.ok(post.content.includes('class="hexo-reader"'));
    assert.ok(pipeline.cache.has(post._hexoReader.key));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
