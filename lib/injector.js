'use strict';

const path = require('path');
const { htmlToReadableText } = require('./extractor');
const { AudioCache, buildKey } = require('./cache');
const { synthesize } = require('./tts');
const { PLACEHOLDER } = require('./tag');

const READER_ASSET_PREFIX = 'assets/hexo-reader';
const READER_JS_ROUTE = `${READER_ASSET_PREFIX}/reader.js`;
const READER_CSS_ROUTE = `${READER_ASSET_PREFIX}/reader.css`;

function shouldSkipPost(post, skipPatterns) {
  if (!post || typeof post !== 'object') {
    return true;
  }
  if (post.reader === false) {
    return true;
  }
  const sourcePath = String(post.source || post.path || '');
  for (const pattern of Array.isArray(skipPatterns) ? skipPatterns : []) {
    if (typeof pattern === 'string' && pattern !== '' && sourcePath.includes(pattern)) {
      return true;
    }
  }
  return false;
}

function joinUrlSegments(...parts) {
  const cleaned = parts
    .filter((p) => typeof p === 'string')
    .map((p) => p.replace(/^[\\/]+|[\\/]+$/g, ''))
    .filter((p) => p !== '');
  return `/${cleaned.join('/')}`;
}

function buildPlayerMarkup({ audioUrl, position, buttonLabel, postTitle }) {
  const safeUrl = String(audioUrl).replace(/"/g, '&quot;');
  const safeLabel = String(buttonLabel).replace(/[<>&"']/g, (c) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;'
  }[c]));
  const safeTitle = String(postTitle || '').replace(/[<>&"']/g, (c) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;'
  }[c]));
  const displayTitle = safeTitle || safeLabel;
  return [
    `<div class="hexo-reader" data-position="${position}" data-audio="${safeUrl}" data-title="${safeTitle}">`,
    '  <div class="hexo-reader__panel" role="group" aria-label="文章朗读">',
    '    <button type="button" class="hexo-reader__play" aria-label="播放">',
    '      <svg class="hexo-reader__icon-play" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>',
    '      <svg class="hexo-reader__icon-pause" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>',
    '    </button>',
    '    <div class="hexo-reader__body">',
    '      <div class="hexo-reader__header">',
    `        <span class="hexo-reader__title" title="${displayTitle}">${displayTitle}</span>`,
    '      </div>',
    '      <div class="hexo-reader__progress">',
    '        <input type="range" class="hexo-reader__seek" min="0" max="1000" value="0" step="1" aria-label="进度" />',
    '        <span class="hexo-reader__time" aria-live="off">0:00 / 0:00</span>',
    '      </div>',
    '      <div class="hexo-reader__speed">',
    '        <span class="hexo-reader__speed-label">速度</span>',
    '        <div class="hexo-reader__rates" role="group" aria-label="播放速度">',
    '          <button type="button" class="hexo-reader__rate" data-rate="0.75" aria-pressed="false">0.75x</button>',
    '          <button type="button" class="hexo-reader__rate" data-rate="1" aria-pressed="true">1x</button>',
    '          <button type="button" class="hexo-reader__rate" data-rate="1.25" aria-pressed="false">1.25x</button>',
    '          <button type="button" class="hexo-reader__rate" data-rate="1.5" aria-pressed="false">1.5x</button>',
    '          <button type="button" class="hexo-reader__rate" data-rate="2" aria-pressed="false">2x</button>',
    '        </div>',
    '      </div>',
    '    </div>',
    `    <audio class="hexo-reader__audio" preload="none" src="${safeUrl}"></audio>`,
    '  </div>',
    '</div>'
  ].join('\n');
}

class ReaderPipeline {
  /**
   * @param {object} ctx Hexo context.
   * @param {object} config Resolved plugin config.
   * @param {object} [logger] Logger ({info, warn, error}).
   */
  constructor(ctx, config, logger) {
    this.hexo = ctx;
    this.config = config;
    this.log = logger || (ctx && ctx.log) || { info() {}, warn() {}, error() {} };
    const cacheDirAbs = path.resolve(ctx.base_dir || process.cwd(), config.cacheDir);
    this.cache = new AudioCache(cacheDirAbs);
    this.entries = new Map();
  }

  /**
   * Process one rendered post: extract text, ensure audio is cached, and
   * compute the public audio URL. Mutates `post.content` to include the
   * player markup unless skipped or {% reader %} tag was used.
   *
   * @param {object} post Post data from `after_post_render` filter.
   * @returns {Promise<void>} Resolves when processing is complete.
   */
  async processPost(post) {
    if (!this.config.enable) {
      return;
    }
    if (shouldSkipPost(post, this.config.skip)) {
      return;
    }
    const html = typeof post.content === 'string' ? post.content : '';
    const text = htmlToReadableText(html);
    if (!text || text.length < 4) {
      return;
    }
    const usable = text.length > this.config.maxTextLength
      ? text.slice(0, this.config.maxTextLength)
      : text;

    const key = buildKey({
      text: usable,
      voice: this.config.voice,
      rate: this.config.rate,
      pitch: this.config.pitch,
      format: this.config.outputFormat
    });

    const audioUrl = joinUrlSegments(this.hexo.config.root || '/', this.config.audioDir, `${key}.mp3`);

    let ready = this.cache.has(key);
    if (!ready) {
      try {
        const buf = await synthesize(usable, {
          voice: this.config.voice,
          rate: this.config.rate,
          pitch: this.config.pitch,
          outputFormat: this.config.outputFormat,
          chunkSize: this.config.chunkSize,
          timeoutMs: this.config.timeoutMs
        });
        this.cache.write(key, buf);
        ready = true;
        this.log.info(`hexo-reader: synthesized ${post.title || post.source} (${buf.length} bytes)`);
      } catch (err) {
        const msg = `hexo-reader: TTS failed for "${post.title || post.source}": ${err.message}`;
        if (this.config.failOnError) {
          throw new Error(msg);
        }
        this.log.warn(msg);
        return;
      }
    }

    this.entries.set(key, {
      relPath: joinUrlSegments(this.config.audioDir, `${key}.mp3`).replace(/^\/+/, '')
    });

    post._hexoReader = { key, audioUrl, ready };

    if (!ready) {
      return;
    }

    const playerMarkup = buildPlayerMarkup({
      audioUrl,
      position: this.config.position,
      buttonLabel: this.config.buttonLabel,
      postTitle: post.title
    });

    const usedTag = typeof post.content === 'string' && post.content.includes(PLACEHOLDER);
    if (usedTag) {
      post.content = post.content.split(PLACEHOLDER).join(playerMarkup);
    } else if (this.config.autoInject) {
      post.content = `${post.content}\n${playerMarkup}`;
    } else {
      return;
    }
  }

  /**
   * Build list of generator outputs: per-post cached audio + shared JS/CSS.
   *
   * @returns {Array<{path: string, data: Buffer|string}>}
   */
  buildGeneratorOutputs() {
    const outputs = [];
    for (const [key, entry] of this.entries.entries()) {
      try {
        const buf = this.cache.read(key);
        outputs.push({ path: entry.relPath, data: buf });
      } catch (err) {
        this.log.warn(`hexo-reader: failed to read cached audio ${key}: ${err.message}`);
      }
    }
    return outputs;
  }
}

module.exports = {
  ReaderPipeline,
  buildPlayerMarkup,
  shouldSkipPost,
  joinUrlSegments,
  READER_JS_ROUTE,
  READER_CSS_ROUTE
};
