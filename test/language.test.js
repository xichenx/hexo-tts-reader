'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  scriptOfCodePoint,
  detectLanguage,
  segmentByLanguage
} = require('../lib/language');
const { planJobs } = require('../lib/tts');
const { resolveConfig } = require('../lib/config');

const VOICES = {
  zh: 'zh-CN-XiaoxiaoNeural',
  en: 'en-US-AriaNeural',
  ja: 'ja-JP-NanamiNeural',
  ko: 'ko-KR-SunHiNeural',
  ru: 'ru-RU-SvetlanaNeural'
};

test('scriptOfCodePoint classifies common scripts', () => {
  assert.equal(scriptOfCodePoint('A'.codePointAt(0)), 'latin');
  assert.equal(scriptOfCodePoint('中'.codePointAt(0)), 'han');
  assert.equal(scriptOfCodePoint('あ'.codePointAt(0)), 'kana');
  assert.equal(scriptOfCodePoint('한'.codePointAt(0)), 'hangul');
  assert.equal(scriptOfCodePoint('Я'.codePointAt(0)), 'cyrillic');
  assert.equal(scriptOfCodePoint('1'.codePointAt(0)), 'neutral');
  assert.equal(scriptOfCodePoint(' '.codePointAt(0)), 'neutral');
});

test('detectLanguage picks dominant language and prefers Japanese on kana', () => {
  assert.equal(detectLanguage('这是中文内容'), 'zh');
  assert.equal(detectLanguage('Hello world'), 'en');
  assert.equal(detectLanguage('これは日本語です'), 'ja');
  // Han + kana mixed must resolve to Japanese, not Chinese.
  assert.equal(detectLanguage('日本語のテキスト'), 'ja');
  assert.equal(detectLanguage('안녕하세요'), 'ko');
  assert.equal(detectLanguage('12345 ...'), null);
  assert.equal(detectLanguage(''), null);
});

test('segmentByLanguage routes mixed zh/en to mapped voices', () => {
  const segments = segmentByLanguage('使用 React 开发', {
    voices: VOICES,
    defaultVoice: VOICES.zh
  });
  assert.equal(segments.length, 3);
  assert.deepEqual(segments.map((s) => s.lang), ['zh', 'en', 'zh']);
  assert.equal(segments[0].voice, VOICES.zh);
  assert.equal(segments[1].voice, VOICES.en);
  assert.equal(segments[2].voice, VOICES.zh);
  // Round-trips to the original text.
  assert.equal(segments.map((s) => s.text).join(''), '使用 React 开发');
});

test('segmentByLanguage merges adjacent same-voice runs', () => {
  // Without a Russian voice, Cyrillic falls back to the default (zh) voice and
  // merges with surrounding Chinese into a single segment.
  const segments = segmentByLanguage('中文Россия中文', {
    voices: { zh: VOICES.zh },
    defaultVoice: VOICES.zh
  });
  assert.equal(segments.length, 1);
  assert.equal(segments[0].voice, VOICES.zh);
});

test('segmentByLanguage keeps kanji+kana on the Japanese voice', () => {
  // 構造 (kanji) is adjacent to の/データ (kana) and must be promoted to ja so
  // the sentence is not split between a Chinese and a Japanese voice.
  const segments = segmentByLanguage('データ構造', {
    voices: VOICES,
    defaultVoice: VOICES.zh
  });
  assert.equal(segments.length, 1);
  assert.equal(segments[0].voice, VOICES.ja);
});

test('planJobs uses a single voice when autoVoice is off', () => {
  const jobs = planJobs('使用 React 开发', {
    voice: VOICES.zh,
    autoVoice: false,
    chunkSize: 4000
  });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].voice, VOICES.zh);
});

test('planJobs splits by voice when autoVoice is on', () => {
  const jobs = planJobs('使用 React 开发', {
    voice: VOICES.zh,
    autoVoice: true,
    voices: VOICES,
    chunkSize: 4000
  });
  assert.deepEqual(jobs.map((j) => j.voice), [VOICES.zh, VOICES.en, VOICES.zh]);
});

test('resolveConfig exposes autoVoice and a merged voices map', () => {
  const cfg = resolveConfig({ autoVoice: true, voices: { en: 'en-GB-LibbyNeural' } });
  assert.equal(cfg.autoVoice, true);
  assert.equal(cfg.voices.en, 'en-GB-LibbyNeural');
  // Untouched defaults remain available.
  assert.equal(cfg.voices.zh, 'zh-CN-XiaoxiaoNeural');
});

test('resolveConfig defaults autoVoice to false', () => {
  const cfg = resolveConfig({});
  assert.equal(cfg.autoVoice, false);
});
