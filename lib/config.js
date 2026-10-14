'use strict';

const { resolveLocale, labelsFor } = require('./i18n');

const DEFAULT_VOICES = Object.freeze({
  zh: 'zh-CN-XiaoxiaoNeural',
  en: 'en-US-AriaNeural',
  ja: 'ja-JP-NanamiNeural',
  ko: 'ko-KR-SunHiNeural',
  ru: 'ru-RU-SvetlanaNeural'
});

const DEFAULTS = Object.freeze({
  enable: true,
  autoInject: true,
  locale: 'zh',
  cacheChunks: true,
  voice: 'zh-CN-XiaoxiaoNeural',
  autoVoice: 'article',
  voices: DEFAULT_VOICES,
  pronunciations: [],
  // A slightly slower, lower pitch is easier to listen to for long-form
  // Chinese narration than the service defaults.
  rate: -8,
  pitch: -2,
  outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
  audioDir: 'audio',
  cacheDir: '.hexo-reader-cache',
  maxTextLength: 100000,
  chunkSize: 4000,
  skip: [],
  position: 'bottom-right',
  buttonLabel: '朗读本文',
  failOnError: false,
  timeoutMs: 60000,
  retries: 2,
  retryDelayMs: 500,
  pruneCache: false
});

const ALLOWED_POSITIONS = new Set([
  'bottom-right',
  'bottom-left',
  'top-right',
  'top-left'
]);

function isPlainObject(v) {
  return Object.prototype.toString.call(v) === '[object Object]';
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  if (n < min) {
    return min;
  }
  if (n > max) {
    return max;
  }
  return n;
}

function sanitizeVoiceMap(input) {
  const out = Object.assign({}, DEFAULT_VOICES);
  if (isPlainObject(input)) {
    for (const key of Object.keys(input)) {
      const value = input[key];
      if (typeof value === 'string' && value.trim() !== '') {
        out[key.trim().toLowerCase()] = value.trim();
      }
    }
  }
  return out;
}

function sanitizePronunciations(input) {
  if (!isPlainObject(input)) {
    return [];
  }
  return Object.entries(input)
    .filter(([from, to]) => from.trim() !== '' && typeof to === 'string')
    .map(([from, to]) => ({ from, to }));
}

function mergePronunciations(siteEntries, postEntries) {
  const merged = new Map();
  for (const entry of siteEntries) {
    merged.set(entry.from, entry.to);
  }
  for (const entry of postEntries) {
    merged.set(entry.from, entry.to);
  }
  return Array.from(merged, ([from, to]) => ({ from, to }));
}

function sanitizeRelativeDir(dir, fallback) {
  if (typeof dir !== 'string' || dir.trim() === '') {
    return fallback;
  }
  const trimmed = dir.trim().replace(/^[\\/]+/, '').replace(/[\\/]+$/, '');
  if (trimmed === '' || trimmed.includes('..')) {
    return fallback;
  }
  return trimmed;
}

function resolveConfig(userConfig, siteLanguage) {
  const src = isPlainObject(userConfig) ? userConfig : {};
  const hasCustomVoice = typeof src.voice === 'string' && src.voice.trim() !== '';
  const locale = resolveLocale(src.locale && src.locale !== 'auto' ? src.locale : siteLanguage);

  const cfg = {
    enable: src.enable !== false,
    autoInject: src.autoInject !== false,
    locale,
    cacheChunks: src.cacheChunks !== false,
    voice: hasCustomVoice
      ? src.voice.trim()
      : DEFAULTS.voice,
    // An explicit voice stays fixed unless the site also opts into routing.
    autoVoice: src.autoVoice === true || src.autoVoice === false || src.autoVoice === 'article'
      ? src.autoVoice
      : (hasCustomVoice ? false : DEFAULTS.autoVoice),
    voices: sanitizeVoiceMap(src.voices),
    pronunciations: sanitizePronunciations(src.pronunciations),
    rate: clampNumber(src.rate, -100, 100, DEFAULTS.rate),
    pitch: clampNumber(src.pitch, -100, 100, DEFAULTS.pitch),
    outputFormat: typeof src.outputFormat === 'string' && src.outputFormat.trim() !== ''
      ? src.outputFormat.trim()
      : DEFAULTS.outputFormat,
    audioDir: sanitizeRelativeDir(src.audioDir, DEFAULTS.audioDir),
    cacheDir: sanitizeRelativeDir(src.cacheDir, DEFAULTS.cacheDir),
    maxTextLength: clampNumber(src.maxTextLength, 100, 1000000, DEFAULTS.maxTextLength),
    chunkSize: clampNumber(src.chunkSize, 200, 8000, DEFAULTS.chunkSize),
    skip: Array.isArray(src.skip) ? src.skip.filter((p) => typeof p === 'string') : [],
    position: ALLOWED_POSITIONS.has(src.position) ? src.position : DEFAULTS.position,
    buttonLabel: typeof src.buttonLabel === 'string' && src.buttonLabel.trim() !== ''
      ? src.buttonLabel
      : labelsFor(locale).play,
    failOnError: src.failOnError === true,
    timeoutMs: clampNumber(src.timeoutMs, 5000, 600000, DEFAULTS.timeoutMs),
    retries: Math.floor(clampNumber(src.retries, 0, 10, DEFAULTS.retries)),
    retryDelayMs: Math.floor(clampNumber(src.retryDelayMs, 0, 60000, DEFAULTS.retryDelayMs)),
    pruneCache: src.pruneCache === true
  };

  return cfg;
}

/** Merge supported front-matter narration settings onto resolved site defaults. */
function resolvePostConfig(siteConfig, readerOptions) {
  const src = isPlainObject(readerOptions) ? readerOptions : {};
  const hasVoice = typeof src.voice === 'string' && src.voice.trim() !== '';
  const hasAutoVoice = src.autoVoice === true || src.autoVoice === false || src.autoVoice === 'article';
  return {
    ...siteConfig,
    voice: hasVoice ? src.voice.trim() : siteConfig.voice,
    autoVoice: hasAutoVoice ? src.autoVoice : (hasVoice ? false : siteConfig.autoVoice),
    rate: src.rate != null && src.rate !== ''
      ? clampNumber(src.rate, -100, 100, siteConfig.rate) : siteConfig.rate,
    pitch: src.pitch != null && src.pitch !== ''
      ? clampNumber(src.pitch, -100, 100, siteConfig.pitch) : siteConfig.pitch,
    text: typeof src.text === 'string' && src.text.trim() !== '' ? src.text.trim() : null,
    pronunciations: mergePronunciations(
      siteConfig.pronunciations || [], sanitizePronunciations(src.pronunciations)
    )
  };
}

module.exports = {
  DEFAULTS,
  DEFAULT_VOICES,
  resolveConfig,
  resolvePostConfig
};
