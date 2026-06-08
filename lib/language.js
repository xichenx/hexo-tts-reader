'use strict';

/**
 * Lightweight, dependency-free language segmentation for TTS.
 *
 * Detection is script-based (Unicode ranges), which is enough to route mixed
 * content — e.g. a Chinese post quoting English terms — to per-language voices.
 * It is intentionally heuristic: pure Han defaults to Chinese, kana marks
 * Japanese (and pulls in adjacent kanji), Hangul marks Korean, Cyrillic Russian.
 */

const SCRIPT_TO_LANG = Object.freeze({
  latin: 'en',
  han: 'zh',
  kana: 'ja',
  hangul: 'ko',
  cyrillic: 'ru'
});

/**
 * Classify a single code point into a coarse writing-system bucket.
 *
 * @param {number} cp Unicode code point.
 * @returns {string} One of latin|han|kana|hangul|cyrillic|neutral.
 */
function scriptOfCodePoint(cp) {
  if (!Number.isFinite(cp)) {
    return 'neutral';
  }
  // Hiragana, Katakana, Katakana phonetic extensions, half-width katakana.
  if ((cp >= 0x3040 && cp <= 0x30FF) || (cp >= 0x31F0 && cp <= 0x31FF) || (cp >= 0xFF66 && cp <= 0xFF9D)) {
    return 'kana';
  }
  // Hangul syllables, Jamo, compatibility Jamo.
  if ((cp >= 0xAC00 && cp <= 0xD7A3) || (cp >= 0x1100 && cp <= 0x11FF) || (cp >= 0x3130 && cp <= 0x318F)) {
    return 'hangul';
  }
  // CJK Unified Ideographs (+ ext A, compatibility, ext B).
  if ((cp >= 0x4E00 && cp <= 0x9FFF) || (cp >= 0x3400 && cp <= 0x4DBF) ||
      (cp >= 0xF900 && cp <= 0xFAFF) || (cp >= 0x20000 && cp <= 0x2A6DF)) {
    return 'han';
  }
  // Cyrillic (+ supplement).
  if ((cp >= 0x0400 && cp <= 0x04FF) || (cp >= 0x0500 && cp <= 0x052F)) {
    return 'cyrillic';
  }
  // Basic Latin letters + Latin-1 / extended letters.
  if ((cp >= 0x41 && cp <= 0x5A) || (cp >= 0x61 && cp <= 0x7A) || (cp >= 0xC0 && cp <= 0x024F)) {
    return 'latin';
  }
  return 'neutral';
}

/**
 * Detect the dominant language of a text by counting letter scripts.
 * Neutral characters (digits, punctuation, whitespace) are ignored.
 *
 * @param {string} text Input text.
 * @returns {string|null} A language code (zh|en|ja|ko|ru) or null when unknown.
 */
function detectLanguage(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return null;
  }
  const counts = Object.create(null);
  let hasKana = false;
  for (const ch of text) {
    const script = scriptOfCodePoint(ch.codePointAt(0));
    if (script === 'neutral') {
      continue;
    }
    if (script === 'kana') {
      hasKana = true;
    }
    counts[script] = (counts[script] || 0) + 1;
  }
  // Any kana presence strongly implies Japanese even if Han dominates.
  if (hasKana) {
    return 'ja';
  }
  let best = null;
  let bestCount = 0;
  for (const script of Object.keys(counts)) {
    if (counts[script] > bestCount) {
      bestCount = counts[script];
      best = script;
    }
  }
  return best ? SCRIPT_TO_LANG[best] : null;
}

/**
 * Split text into ordered runs of consecutive letters sharing a script.
 * Neutral characters stick to the run currently being built so punctuation and
 * spacing stay attached to their surrounding words.
 *
 * @param {string} text Input text.
 * @returns {Array<{script: string, text: string}>} Ordered script runs.
 */
function toScriptRuns(text) {
  const runs = [];
  let cur = null;
  for (const ch of text) {
    const script = scriptOfCodePoint(ch.codePointAt(0));
    if (cur === null) {
      cur = { script, text: ch };
    } else if (script === 'neutral' || script === cur.script) {
      cur.text += ch;
    } else if (cur.script === 'neutral') {
      // A leading neutral-only run adopts the first real script it meets.
      cur.script = script;
      cur.text += ch;
    } else {
      runs.push(cur);
      cur = { script, text: ch };
    }
  }
  if (cur) {
    runs.push(cur);
  }
  return runs;
}

/**
 * Segment text by language and resolve each run to a voice.
 *
 * Adjacent runs that resolve to the same voice are merged so the synthesizer
 * makes the fewest possible reconnections.
 *
 * @param {string} text Source text.
 * @param {object} options Segmentation options.
 * @param {Object<string,string>} options.voices Map of language code -> voice id.
 * @param {string} options.defaultVoice Fallback voice for unknown languages.
 * @returns {Array<{voice: string, lang: (string|null), text: string}>} Ordered segments.
 */
function segmentByLanguage(text, options) {
  if (typeof text !== 'string' || text.length === 0) {
    return [];
  }
  const opts = options || {};
  const voices = opts.voices && typeof opts.voices === 'object' ? opts.voices : {};
  const defaultVoice = opts.defaultVoice;

  const runs = toScriptRuns(text);

  // Promote Han runs touching kana to Japanese — a kanji+kana sentence should
  // not be split between a Chinese and a Japanese voice.
  for (let i = 0; i < runs.length; i++) {
    if (runs[i].script !== 'han') {
      continue;
    }
    const prev = runs[i - 1];
    const next = runs[i + 1];
    if ((prev && prev.script === 'kana') || (next && next.script === 'kana')) {
      runs[i].script = 'kana';
    }
  }

  const segments = [];
  for (const run of runs) {
    const lang = run.script === 'neutral' ? null : SCRIPT_TO_LANG[run.script] || null;
    const voice = (lang && voices[lang]) ? voices[lang] : defaultVoice;
    const last = segments[segments.length - 1];
    if (last && last.voice === voice) {
      last.text += run.text;
    } else {
      segments.push({ voice, lang, text: run.text });
    }
  }
  return segments;
}

module.exports = {
  SCRIPT_TO_LANG,
  scriptOfCodePoint,
  detectLanguage,
  segmentByLanguage
};
