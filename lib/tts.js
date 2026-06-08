'use strict';

const { chunkText } = require('./extractor');
const { segmentByLanguage } = require('./language');

let _MsEdgeTTS = null;
let _OUTPUT_FORMAT = null;

function loadEdgeTTS() {
  if (_MsEdgeTTS === null) {
    const mod = require('msedge-tts');
    _MsEdgeTTS = mod.MsEdgeTTS;
    _OUTPUT_FORMAT = mod.OUTPUT_FORMAT || {};
    if (typeof _MsEdgeTTS !== 'function') {
      throw new Error('hexo-reader: msedge-tts is installed but exports an unexpected shape');
    }
  }
  return { MsEdgeTTS: _MsEdgeTTS, OUTPUT_FORMAT: _OUTPUT_FORMAT };
}

function resolveFormat(name, OUTPUT_FORMAT) {
  if (typeof name !== 'string' || name.trim() === '') {
    return undefined;
  }
  const direct = name.trim();
  const enumKey = direct.toUpperCase().replace(/-/g, '_');
  if (OUTPUT_FORMAT && Object.prototype.hasOwnProperty.call(OUTPUT_FORMAT, enumKey)) {
    return OUTPUT_FORMAT[enumKey];
  }
  return direct;
}

function collectStream(stream, timeoutMs) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let settled = false;
    const onDone = (err, buf) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (err) {
        reject(err);
      } else {
        resolve(buf);
      }
    };
    const timer = setTimeout(() => {
      onDone(new Error(`hexo-reader: TTS stream timed out after ${timeoutMs}ms`));
      try {
        stream.destroy(new Error('timeout'));
      } catch (_e) {
        // ignore
      }
    }, timeoutMs);

    stream.on('data', (c) => {
      if (Buffer.isBuffer(c)) {
        chunks.push(c);
      } else if (typeof c === 'string') {
        chunks.push(Buffer.from(c));
      }
    });
    stream.on('end', () => onDone(null, Buffer.concat(chunks)));
    stream.on('close', () => onDone(null, Buffer.concat(chunks)));
    stream.on('error', (err) => onDone(err));
  });
}

async function synthesizeChunk(tts, text, timeoutMs) {
  const result = tts.toStream(text);
  const stream = result && result.audioStream
    ? result.audioStream
    : (typeof result.on === 'function' ? result : null);
  if (!stream) {
    throw new Error('hexo-reader: unexpected msedge-tts stream shape');
  }
  return collectStream(stream, timeoutMs);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run `fn` with retries and exponential backoff. `fn` receives the zero-based
 * attempt index so it can rebuild transient state (e.g. a dead connection).
 *
 * @param {function(number): Promise<*>} fn Operation to attempt.
 * @param {object} options Retry options.
 * @param {number} options.retries Number of retries after the first attempt (>= 0).
 * @param {number} options.baseDelayMs Base backoff delay; doubles each retry.
 * @param {function(Error, number, number)} [options.onRetry] Called before each retry.
 * @returns {Promise<*>} Resolves with `fn`'s result, or rejects with the last error.
 */
async function withRetry(fn, options) {
  const opts = options || {};
  const retries = Number.isFinite(opts.retries) && opts.retries > 0 ? Math.floor(opts.retries) : 0;
  const baseDelayMs = Number.isFinite(opts.baseDelayMs) && opts.baseDelayMs >= 0 ? opts.baseDelayMs : 0;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        if (typeof opts.onRetry === 'function') {
          opts.onRetry(err, attempt + 1, delay);
        }
        if (delay > 0) {
          await sleep(delay);
        }
      }
    }
  }
  throw lastErr;
}

/**
 * Build an ordered list of synthesis jobs `{ voice, text }` from input text.
 * When `autoVoice` is enabled the text is segmented by language and each
 * segment is routed to its mapped voice; otherwise a single voice is used.
 * Every segment is further split to honour `chunkSize`.
 *
 * @param {string} text Source text.
 * @param {object} opts Synthesis options (voice, autoVoice, voices, chunkSize).
 * @returns {Array<{voice: string, text: string}>} Ordered, non-empty jobs.
 */
function planJobs(text, opts) {
  const chunkSize = Number.isFinite(opts.chunkSize) ? opts.chunkSize : 4000;
  const segments = opts.autoVoice && opts.voices
    ? segmentByLanguage(text, { voices: opts.voices, defaultVoice: opts.voice })
    : [{ voice: opts.voice, text }];

  const jobs = [];
  for (const seg of segments) {
    if (!seg || typeof seg.text !== 'string' || seg.text.trim() === '') {
      continue;
    }
    const voice = seg.voice || opts.voice;
    for (const piece of chunkText(seg.text, chunkSize)) {
      if (piece && piece.trim() !== '') {
        jobs.push({ voice, text: piece });
      }
    }
  }
  return jobs;
}

/**
 * Synthesize plain text into a single MP3 Buffer using Microsoft Edge TTS.
 * Long input is split into chunks (sentence-aware) and concatenated; MP3
 * frame stream concatenation is safe for playback. When `autoVoice` is on the
 * text is segmented by language and synthesized with per-language voices,
 * switching the connection voice only when it changes.
 *
 * @param {string} text Text to synthesize. Must be non-empty.
 * @param {object} options Synthesis options.
 * @param {string} options.voice Default/fallback voice id (e.g. "zh-CN-XiaoxiaoNeural").
 * @param {boolean} [options.autoVoice] Enable per-segment language voice routing.
 * @param {Object<string,string>} [options.voices] Map of language code -> voice id.
 * @param {number} options.rate Rate (-100..100), forwarded as relative percent.
 * @param {number} options.pitch Pitch (-100..100), forwarded as relative percent.
 * @param {string} options.outputFormat Output format identifier.
 * @param {number} options.chunkSize Max characters per chunk.
 * @param {number} options.timeoutMs Per-chunk timeout.
 * @param {number} [options.retries] Retries per chunk after the first try (>= 0).
 * @param {number} [options.retryDelayMs] Base backoff delay; doubles each retry.
 * @param {object} [options.logger] Optional logger with a `warn` method.
 * @returns {Promise<Buffer>} Concatenated MP3 buffer.
 */
async function synthesize(text, options) {
  if (typeof text !== 'string' || text.trim() === '') {
    throw new TypeError('hexo-reader: synthesize requires non-empty text');
  }
  const opts = options || {};
  const { MsEdgeTTS, OUTPUT_FORMAT } = loadEdgeTTS();
  const format = resolveFormat(opts.outputFormat, OUTPUT_FORMAT);
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : 60000;
  const retries = Number.isFinite(opts.retries) && opts.retries > 0 ? Math.floor(opts.retries) : 0;
  const retryDelayMs = Number.isFinite(opts.retryDelayMs) && opts.retryDelayMs >= 0
    ? opts.retryDelayMs
    : 500;
  const logger = opts.logger && typeof opts.logger.warn === 'function' ? opts.logger : null;

  const jobs = planJobs(text, opts);
  if (jobs.length === 0) {
    throw new Error('hexo-reader: no synthesizable text after chunking');
  }

  // A single shared connection is reused across chunks for speed; a failed
  // chunk likely left the WebSocket dead, so retries rebuild it from scratch.
  let tts = null;
  let currentVoice = null;

  const closeTts = () => {
    if (tts && typeof tts.close === 'function') {
      try {
        tts.close();
      } catch (_e) {
        // ignore
      }
    }
    tts = null;
    currentVoice = null;
  };

  try {
    const buffers = [];
    for (const job of jobs) {
      const buf = await withRetry(async (attempt) => {
        if (attempt > 0 || tts === null) {
          closeTts();
          tts = new MsEdgeTTS();
        }
        if (job.voice !== currentVoice) {
          await tts.setMetadata(job.voice, format);
          currentVoice = job.voice;
        }
        return synthesizeChunk(tts, job.text, timeoutMs);
      }, {
        retries,
        baseDelayMs: retryDelayMs,
        onRetry: (err, n, delay) => {
          if (logger) {
            logger.warn(
              `hexo-reader: TTS chunk failed (retry ${n}/${retries} in ${delay}ms): ${err.message}`
            );
          }
        }
      });
      if (Buffer.isBuffer(buf) && buf.length > 0) {
        buffers.push(buf);
      }
    }
    if (buffers.length === 0) {
      throw new Error('hexo-reader: TTS returned no audio data');
    }
    return Buffer.concat(buffers);
  } finally {
    closeTts();
  }
}

module.exports = {
  synthesize,
  planJobs,
  withRetry,
  loadEdgeTTS,
  resolveFormat
};
