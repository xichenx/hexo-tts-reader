'use strict';

const path = require('path');
const { AudioCache, buildKey } = require('./cache');
const { synthesize, planChunkKeys } = require('./tts');
const { PLACEHOLDER } = require('./tag');
const { resolvePostConfig } = require('./config');
const { prepareNarrationText } = require('./narration');
const { labelsFor } = require('./i18n');

const READER_ASSET_PREFIX = 'assets/hexo-reader';
const READER_JS_ROUTE = `${READER_ASSET_PREFIX}/reader.js`;
const READER_CSS_ROUTE = `${READER_ASSET_PREFIX}/reader.css`;

function shouldSkipPost(post, skipPatterns) {
  if (!post || typeof post !== 'object') {
    return true;
  }
  if (post.reader === false || (post.reader && post.reader.enable === false)) {
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

function escapeAttribute(value) {
  return String(value).replace(/[<>&"']/g, (c) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function buildPlayerMarkup({ audioUrl, position, buttonLabel, postTitle, locale = 'zh' }) {
  const labels = labelsFor(locale);
  const safeUrl = escapeAttribute(audioUrl);
  const safeLabel = escapeAttribute(buttonLabel);
  const safeTitle = escapeAttribute(postTitle || '');
  const displayTitle = safeTitle || safeLabel;
  const pauseLabel = escapeAttribute(labels.pause);
  const attr = (key) => escapeAttribute(labels[key]);
  const headphones = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 14v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="12" width="4" height="8" rx="2"/><rect x="17" y="12" width="4" height="8" rx="2"/></svg>';
  const skip = (forward) => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><g${forward ? ' transform="translate(24 0) scale(-1 1)"' : ''}><path d="M5 7a8 8 0 1 1-1 9M5 3v4h4"/></g><text x="12" y="15" fill="currentColor" stroke="none" text-anchor="middle" font-size="8" font-weight="600" font-family="sans-serif">10</text></svg>`;
  return `<div class="hexo-reader" lang="${escapeAttribute(locale)}" data-position="${escapeAttribute(position)}" data-audio="${safeUrl}" data-title="${safeTitle}" data-label-play="${safeLabel}" data-label-pause="${pauseLabel}" data-label-ready="${attr('ready')}" data-label-playing="${attr('playing')}" data-label-paused="${attr('paused')}" data-label-ended="${attr('ended')}" data-label-failed="${attr('failed')}" data-label-load-failed="${attr('loadFailed')}">
  <button type="button" class="hexo-reader__launcher" aria-label="${attr('player')}" aria-expanded="false">${headphones}<span class="hexo-reader__activity" aria-hidden="true"></span></button>
  <div class="hexo-reader__panel" role="group" aria-label="${attr('player')}">
    <div class="hexo-reader__body">
      <div class="hexo-reader__header">
        <span class="hexo-reader__heading">
          <span class="hexo-reader__status" aria-live="polite">${attr('ready')}</span>
          <span class="hexo-reader__title" title="${displayTitle}">${displayTitle}</span>
        </span>
        <button type="button" class="hexo-reader__collapse" aria-label="${attr('collapse')}" title="${attr('collapse')}"><svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="m5 8 5 5 5-5"/></svg></button>
      </div>
      <div class="hexo-reader__progress">
        <input type="range" class="hexo-reader__seek" min="0" max="1000" value="0" step="1" aria-label="${attr('seek')}" />
        <span class="hexo-reader__time" aria-live="off"><span class="hexo-reader__elapsed">0:00</span><span class="hexo-reader__duration">0:00</span></span>
      </div>
      <div class="hexo-reader__controls">
        <div class="hexo-reader__transport">
          <button type="button" class="hexo-reader__skip" data-skip="-10" aria-label="${attr('skipBack')}" title="${attr('skipBack')}">${skip(false)}</button>
          <button type="button" class="hexo-reader__play" aria-label="${safeLabel}" aria-keyshortcuts="Space Enter">
            <svg class="hexo-reader__icon-play" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M8 5.8a.8.8 0 0 1 1.2-.7l9.5 6.2a.8.8 0 0 1 0 1.4l-9.5 6.2a.8.8 0 0 1-1.2-.7Z"/></svg>
            <svg class="hexo-reader__icon-pause" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="7" y="5" width="3.5" height="14" rx="1" fill="currentColor"/><rect x="13.5" y="5" width="3.5" height="14" rx="1" fill="currentColor"/></svg>
          </button>
          <button type="button" class="hexo-reader__skip" data-skip="10" aria-label="${attr('skipForward')}" title="${attr('skipForward')}">${skip(true)}</button>
        </div>
        <div class="hexo-reader__speed-picker">
          <button type="button" class="hexo-reader__speed-toggle" aria-label="${attr('speed')}" aria-expanded="false"><span class="hexo-reader__rate-value">1×</span><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="m5 6 3 3 3-3"/></svg></button>
          <div class="hexo-reader__rates" role="group" aria-label="${attr('speed')}" hidden>
            <span class="hexo-reader__speed-label">${attr('speed')}</span>
            <div class="hexo-reader__rate-options">${[0.75, 1, 1.25, 1.5, 2].map(rate => `<button type="button" class="hexo-reader__rate" data-rate="${rate}" aria-pressed="${rate === 1}">${rate}×</button>`).join('')}</div>
          </div>
        </div>
      </div>
    </div>
    <audio class="hexo-reader__audio" preload="metadata" src="${safeUrl}"></audio>
  </div>
</div>`;
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
    this.chunkCache = new AudioCache(path.join(cacheDirAbs, 'chunks'));
    this.entries = new Map();
    this.chunkKeys = new Set();
    this.records = [];
    this.processedPostIds = new Set();
    this.hasCompletePostSet = false;
    this.inFlightAudio = new Map();
    this.synthesizeAudio = synthesize;
  }

  /** Clear per-build references before Hexo runs its render filters. */
  beginGeneration() {
    this.entries.clear();
    this.chunkKeys.clear();
    this.records = [];
    this.processedPostIds.clear();
    this.hasCompletePostSet = false;
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
    const postId = post && (post.source || post.path);
    if (postId) {
      this.processedPostIds.add(String(postId));
    }
    if (shouldSkipPost(post, this.config.skip)) {
      this.record(post, 'skipped', 'disabled or matched skip');
      return;
    }
    const html = typeof post.content === 'string' ? post.content : '';
    const usedTag = html.includes(PLACEHOLDER);
    if (!this.config.autoInject && !usedTag) {
      this.record(post, 'skipped', 'manual mode without reader tag');
      return;
    }
    const postConfig = resolvePostConfig(this.config, post.reader);
    const usable = prepareNarrationText(html, postConfig);
    if (usable.length < 4) {
      this.record(post, 'skipped', 'narration too short');
      return;
    }

    if (this.config.cacheChunks) {
      for (const chunkKey of planChunkKeys(usable, postConfig)) this.chunkKeys.add(chunkKey);
    }

    // When auto voice routing is on, the cache key must reflect the whole voice
    // map, routing mode, and fallback so changing any of them re-synthesizes.
    // buildKey also tracks the synthesis revision for speech-text changes.
    const voiceKey = postConfig.autoVoice
      ? JSON.stringify({ auto: postConfig.autoVoice, voices: postConfig.voices, fallback: postConfig.voice })
      : postConfig.voice;

    const key = buildKey({
      text: usable,
      voice: voiceKey,
      rate: postConfig.rate,
      pitch: postConfig.pitch,
      format: postConfig.outputFormat
    });

    const audioUrl = joinUrlSegments(this.hexo.config.root || '/', this.config.audioDir, `${key}.mp3`);

    const fullCacheHit = this.cache.has(key);
    let shared = false;
    if (!fullCacheHit) {
      try {
        let pending = this.inFlightAudio.get(key);
        shared = !!pending;
        if (!pending) {
          pending = (async () => {
            const buf = await this.synthesizeAudio(usable, {
              voice: postConfig.voice,
              autoVoice: postConfig.autoVoice,
              voices: postConfig.voices,
              rate: postConfig.rate,
              pitch: postConfig.pitch,
              outputFormat: postConfig.outputFormat,
              chunkSize: postConfig.chunkSize,
              timeoutMs: postConfig.timeoutMs,
              retries: postConfig.retries,
              retryDelayMs: postConfig.retryDelayMs,
              chunkCache: this.config.cacheChunks ? this.chunkCache : null,
              onChunk: (hit) => this.record(post, hit ? 'chunkHit' : 'chunkBuilt'),
              logger: this.log
            });
            this.cache.write(key, buf);
            this.log.info(`hexo-reader: synthesized ${post.title || post.source} (${buf.length} bytes)`);
          })();
          this.inFlightAudio.set(key, pending);
        }
        try {
          await pending;
        } finally {
          if (this.inFlightAudio.get(key) === pending) {
            this.inFlightAudio.delete(key);
          }
        }
      } catch (err) {
        const msg = `hexo-reader: TTS failed for "${post.title || post.source}": ${err.message}`;
        if (this.config.failOnError) {
          throw new Error(msg);
        }
        this.log.warn(msg);
        this.record(post, 'failed', err.message);
        return;
      }
    }
    this.record(post, fullCacheHit ? 'cached' : (shared ? 'shared' : 'synthesized'));

    this.entries.set(key, {
      relPath: joinUrlSegments(this.config.audioDir, `${key}.mp3`).replace(/^\/+/, '')
    });

    post._hexoReader = { key, audioUrl, ready: true };

    const playerMarkup = buildPlayerMarkup({
      audioUrl,
      position: this.config.position,
      buttonLabel: this.config.buttonLabel,
      postTitle: post.title,
      locale: this.config.locale
    });

    if (usedTag) {
      post.content = post.content.split(PLACEHOLDER).join(playerMarkup);
    } else if (this.config.autoInject) {
      post.content = `${post.content}\n${playerMarkup}`;
    } else {
      return;
    }
  }

  record(post, status, detail = '') {
    this.records.push({ post: String((post && (post.source || post.title)) || 'unknown'), status, detail });
  }

  report() {
    const counts = {};
    for (const entry of this.records) counts[entry.status] = (counts[entry.status] || 0) + 1;
    const summary = ['cached', 'synthesized', 'shared', 'skipped', 'failed', 'chunkHit', 'chunkBuilt']
      .map((key) => `${key}=${counts[key] || 0}`).join(', ');
    this.log.info(`hexo-reader: build summary: ${summary}`);
    for (const entry of this.records.filter((item) => item.status === 'failed')) {
      this.log.warn(`hexo-reader: failed ${entry.post}: ${entry.detail}`);
    }
    return counts;
  }

  /** Whether every current post passed through this build's render filter. */
  hasFullPostCoverage(locals) {
    const posts = locals && locals.posts;
    const allPosts = Array.isArray(posts)
      ? posts
      : posts && typeof posts.toArray === 'function' ? posts.toArray() : null;
    if (!allPosts) {
      return false;
    }
    return allPosts.every((post) => {
      const postId = post && (post.source || post.path);
      return postId && this.processedPostIds.has(String(postId));
    });
  }

  /**
   * Emit current-post audio on a full build. On a partial build, emit all
   * cached audio: unchanged pages can still reference keys from older runs.
   *
   * @param {object} locals Hexo generator locals.
   * @returns {Array<{path: string, data: Buffer}>}
   */
  buildGeneratorOutputs(locals) {
    this.hasCompletePostSet = this.hasFullPostCoverage(locals);
    const outputs = [];
    const keys = this.hasCompletePostSet
      ? Array.from(this.entries.keys())
      : this.cache.listKeys();
    for (const key of keys) {
      try {
        const buf = this.cache.read(key);
        const entry = this.entries.get(key);
        outputs.push({
          path: entry ? entry.relPath : joinUrlSegments(this.config.audioDir, `${key}.mp3`).replace(/^\/+/, ''),
          data: buf
        });
      } catch (err) {
        this.log.warn(`hexo-reader: failed to read cached audio ${key}: ${err.message}`);
      }
    }
    return outputs;
  }

  /**
   * Delete orphaned audio only after generator locals confirm all current
   * posts passed through the render filter in this build.
   *
   * @returns {number} Number of stale cache files removed.
   */
  pruneCache() {
    if (!this.hasCompletePostSet) {
      this.log.info('hexo-reader: skipping cache prune (partial or unknown post set)');
      return 0;
    }
    const removed = this.cache.prune(new Set(this.entries.keys()));
    if (this.config.cacheChunks) {
      const chunkRemoved = this.chunkCache.prune(this.chunkKeys);
      if (chunkRemoved.length > 0) this.log.info(`hexo-reader: pruned ${chunkRemoved.length} stale chunk(s)`);
    }
    if (removed.length > 0) {
      this.log.info(`hexo-reader: pruned ${removed.length} stale cache file(s)`);
    }
    return removed.length;
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
