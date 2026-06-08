'use strict';

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
  voice: 'zh-CN-XiaoxiaoNeural',
  autoVoice: false,
  voices: DEFAULT_VOICES,
  rate: 0,
  pitch: 0,
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

function resolveConfig(userConfig) {
  const src = isPlainObject(userConfig) ? userConfig : {};

  const cfg = {
    enable: src.enable !== false,
    autoInject: src.autoInject !== false,
    voice: typeof src.voice === 'string' && src.voice.trim() !== ''
      ? src.voice.trim()
      : DEFAULTS.voice,
    autoVoice: src.autoVoice === true,
    voices: sanitizeVoiceMap(src.voices),
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
      : DEFAULTS.buttonLabel,
    failOnError: src.failOnError === true,
    timeoutMs: clampNumber(src.timeoutMs, 5000, 600000, DEFAULTS.timeoutMs),
    retries: Math.floor(clampNumber(src.retries, 0, 10, DEFAULTS.retries)),
    retryDelayMs: Math.floor(clampNumber(src.retryDelayMs, 0, 60000, DEFAULTS.retryDelayMs)),
    pruneCache: src.pruneCache === true
  };

  return cfg;
}

module.exports = {
  DEFAULTS,
  DEFAULT_VOICES,
  resolveConfig
};
