'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function sha1(input) {
  const hash = crypto.createHash('sha1');
  hash.update(input);
  return hash.digest('hex');
}

/**
 * Stable cache key for a synthesized post audio.
 *
 * @param {object} params Cache key components.
 * @param {string} params.text Plain text being synthesized.
 * @param {string} params.voice TTS voice id.
 * @param {number} params.rate Voice rate (-100..100).
 * @param {number} params.pitch Voice pitch (-100..100).
 * @param {string} params.format Output format identifier.
 * @returns {string} 40-char hex digest.
 */
function buildKey({ text, voice, rate, pitch, format }) {
  const payload = JSON.stringify({
    t: typeof text === 'string' ? text : '',
    v: voice || '',
    r: Number(rate) || 0,
    p: Number(pitch) || 0,
    f: format || ''
  });
  return sha1(payload);
}

/**
 * Disk-backed binary cache for synthesized audio.
 * Files live under `<baseDir>/<key>.mp3`. Path traversal is rejected.
 */
class AudioCache {
  /**
   * @param {string} baseDir Absolute cache directory.
   */
  constructor(baseDir) {
    if (typeof baseDir !== 'string' || baseDir.trim() === '') {
      throw new TypeError('AudioCache: baseDir must be a non-empty string');
    }
    this.baseDir = path.resolve(baseDir);
  }

  ensureDir() {
    fs.mkdirSync(this.baseDir, { recursive: true });
  }

  /**
   * Resolve key to absolute path; rejects keys that escape the cache dir.
   *
   * @param {string} key Hex digest.
   * @returns {string} Absolute file path.
   */
  pathFor(key) {
    if (typeof key !== 'string' || !/^[a-f0-9]{8,128}$/i.test(key)) {
      throw new Error('AudioCache: invalid key');
    }
    const full = path.resolve(this.baseDir, `${key}.mp3`);
    const rel = path.relative(this.baseDir, full);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error('AudioCache: key escapes cache directory');
    }
    return full;
  }

  has(key) {
    try {
      const p = this.pathFor(key);
      const stat = fs.statSync(p);
      return stat.isFile() && stat.size > 0;
    } catch (_e) {
      return false;
    }
  }

  read(key) {
    return fs.readFileSync(this.pathFor(key));
  }

  write(key, buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new TypeError('AudioCache.write: buffer must be a non-empty Buffer');
    }
    this.ensureDir();
    const target = this.pathFor(key);
    const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, buffer);
    fs.renameSync(tmp, target);
    return target;
  }

  /**
   * Remove cached `<key>.mp3` files whose key is not in `usedKeys`, plus any
   * leftover `*.tmp` files from interrupted writes. Only files matching the
   * cache naming scheme are touched; unrelated files are left untouched.
   *
   * @param {Set<string>|string[]} usedKeys Keys that must be kept.
   * @returns {string[]} The list of removed cache keys (excludes tmp files).
   */
  prune(usedKeys) {
    const keep = usedKeys instanceof Set
      ? usedKeys
      : new Set(Array.isArray(usedKeys) ? usedKeys : []);
    let files;
    try {
      files = fs.readdirSync(this.baseDir);
    } catch (_e) {
      return [];
    }
    const removed = [];
    for (const name of files) {
      const isTmp = /\.tmp$/i.test(name);
      const match = /^([a-f0-9]{8,128})\.mp3$/i.exec(name);
      if (!isTmp && !match) {
        continue;
      }
      if (match && keep.has(match[1])) {
        continue;
      }
      try {
        fs.unlinkSync(path.join(this.baseDir, name));
        if (match) {
          removed.push(match[1]);
        }
      } catch (_e) {
        // ignore unlink failures (e.g. concurrent removal)
      }
    }
    return removed;
  }
}

module.exports = {
  AudioCache,
  buildKey,
  sha1
};
