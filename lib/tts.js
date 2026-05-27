'use strict';

const { chunkText } = require('./extractor');

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

/**
 * Synthesize plain text into a single MP3 Buffer using Microsoft Edge TTS.
 * Long input is split into chunks (sentence-aware) and concatenated; MP3
 * frame stream concatenation is safe for playback.
 *
 * @param {string} text Text to synthesize. Must be non-empty.
 * @param {object} options Synthesis options.
 * @param {string} options.voice Voice id (e.g. "zh-CN-XiaoxiaoNeural").
 * @param {number} options.rate Rate (-100..100), forwarded as relative percent.
 * @param {number} options.pitch Pitch (-100..100), forwarded as relative percent.
 * @param {string} options.outputFormat Output format identifier.
 * @param {number} options.chunkSize Max characters per chunk.
 * @param {number} options.timeoutMs Per-chunk timeout.
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
  const chunkSize = Number.isFinite(opts.chunkSize) ? opts.chunkSize : 4000;

  const pieces = chunkText(text, chunkSize);
  if (pieces.length === 0) {
    throw new Error('hexo-reader: no synthesizable text after chunking');
  }

  const tts = new MsEdgeTTS();
  try {
    await tts.setMetadata(opts.voice, format);
    const buffers = [];
    for (const piece of pieces) {
      const buf = await synthesizeChunk(tts, piece, timeoutMs);
      if (Buffer.isBuffer(buf) && buf.length > 0) {
        buffers.push(buf);
      }
    }
    if (buffers.length === 0) {
      throw new Error('hexo-reader: TTS returned no audio data');
    }
    return Buffer.concat(buffers);
  } finally {
    if (typeof tts.close === 'function') {
      try {
        tts.close();
      } catch (_e) {
        // ignore
      }
    }
  }
}

module.exports = {
  synthesize,
  loadEdgeTTS,
  resolveFormat
};
