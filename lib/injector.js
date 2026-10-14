'use strict';

const path = require('path');
const { AudioCache, buildKey } = require('./cache');
const { synthesize } = require('./tts');
const { PLACEHOLDER } = require('./tag');
const { resolvePostConfig } = require('./config');
const { prepareNarrationText } = require('./narration');

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

function buildPlayerMarkup({ audioUrl, position, buttonLabel, postTitle }) {
  const safeUrl = escapeAttribute(audioUrl);
  const safeLabel = escapeAttribute(buttonLabel);
  const safeTitle = escapeAttribute(postTitle || '');
  const displayTitle = safeTitle || safeLabel;
  const pauseLabel = escapeAttribute(`${String(buttonLabel)}（暂停）`);
  return [
    `<div class="hexo-reader" data-position="${escapeAttribute(position)}" data-audio="${safeUrl}" data-title="${safeTitle}" data-label-play="${safeLabel}" data-label-pause="${pauseLabel}">`,
    `  <div class="hexo-reader__panel" role="group" aria-label="${safeLabel}">`,
    `    <button type="button" class="hexo-reader__play" aria-label="${safeLabel}">`,
    '      <svg class="hexo-reader__icon-play" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>',
    '      <svg class="hexo-reader__icon-pause" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>',
    '    </button>',
    '    <div class="hexo-reader__body">',
    '      <div class="hexo-reader__header">',
    '        <span class="hexo-reader__heading">',
    `          <span class="hexo-reader__title" title="${displayTitle}">${displayTitle}</span>`,
    '          <span class="hexo-reader__status" aria-live="polite">准备播放</span>',
    '        </span>',
    '        <button type="button" class="hexo-reader__collapse" aria-label="收起播放器" title="收起播放器">×</button>',
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
    `    <audio class="hexo-reader__audio" preload="metadata" src="${safeUrl}"></audio>`,
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
    this.processedPostIds = new Set();
    this.hasCompletePostSet = false;
    this.inFlightAudio = new Map();
    this.synthesizeAudio = synthesize;
  }

  /** Clear per-build references before Hexo runs its render filters. */
  beginGeneration() {
    this.entries.clear();
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
      return;
    }
    const html = typeof post.content === 'string' ? post.content : '';
    const usedTag = html.includes(PLACEHOLDER);
    if (!this.config.autoInject && !usedTag) {
      return;
    }
    const postConfig = resolvePostConfig(this.config, post.reader);
    const usable = prepareNarrationText(html, postConfig);
    if (usable.length < 4) {
      return;
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

    if (!this.cache.has(key)) {
      try {
        let pending = this.inFlightAudio.get(key);
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
        return;
      }
    }

    this.entries.set(key, {
      relPath: joinUrlSegments(this.config.audioDir, `${key}.mp3`).replace(/^\/+/, '')
    });

    post._hexoReader = { key, audioUrl, ready: true };

    const playerMarkup = buildPlayerMarkup({
      audioUrl,
      position: this.config.position,
      buttonLabel: this.config.buttonLabel,
      postTitle: post.title
    });

    if (usedTag) {
      post.content = post.content.split(PLACEHOLDER).join(playerMarkup);
    } else if (this.config.autoInject) {
      post.content = `${post.content}\n${playerMarkup}`;
    } else {
      return;
    }
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
