'use strict';

const BLOCK_TAGS = [
  'script',
  'style',
  'pre',
  'code',
  'noscript',
  'template',
  'iframe',
  'svg',
  'figure'
];

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '\u2026',
  mdash: '\u2014',
  ndash: '\u2013',
  ldquo: '\u201C',
  rdquo: '\u201D',
  lsquo: '\u2018',
  rsquo: '\u2019'
};

function stripBlockElements(html) {
  let out = html;
  for (const tag of BLOCK_TAGS) {
    const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}\\s*>`, 'gi');
    out = out.replace(re, ' ');
    const selfClose = new RegExp(`<${tag}\\b[^>]*/>`, 'gi');
    out = out.replace(selfClose, ' ');
  }
  return out;
}

function insertBreaks(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|li|h[1-6]|blockquote|tr|td|th)\s*>/gi, '\n')
    .replace(/<hr\s*\/?>/gi, '\n');
}

function stripTags(html) {
  return html.replace(/<\/?[a-zA-Z][^>]*>/g, '');
}

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, ent) => {
    if (ent.startsWith('#x') || ent.startsWith('#X')) {
      const code = parseInt(ent.slice(2), 16);
      if (Number.isFinite(code) && code > 0 && code <= 0x10FFFF) {
        try {
          return String.fromCodePoint(code);
        } catch (_e) {
          return match;
        }
      }
      return match;
    }
    if (ent.startsWith('#')) {
      const code = parseInt(ent.slice(1), 10);
      if (Number.isFinite(code) && code > 0 && code <= 0x10FFFF) {
        try {
          return String.fromCodePoint(code);
        } catch (_e) {
          return match;
        }
      }
      return match;
    }
    const lower = ent.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, lower)) {
      return NAMED_ENTITIES[lower];
    }
    return match;
  });
}

function normalizeWhitespace(text) {
  return text
    .replace(/[\t\f\v\r]+/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n[ ]+/g, '\n')
    .replace(/[ ]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Convert rendered post HTML to a plain-text representation suitable for TTS.
 * Removes code blocks, scripts, styles and embedded media; collapses whitespace.
 *
 * @param {string} html Rendered HTML of a post.
 * @returns {string} Cleaned plain text. Empty string when input is empty/invalid.
 */
function htmlToReadableText(html) {
  if (typeof html !== 'string' || html.length === 0) {
    return '';
  }
  let working = stripBlockElements(html);
  working = working.replace(/<!--[\s\S]*?-->/g, ' ');
  working = insertBreaks(working);
  working = stripTags(working);
  working = decodeEntities(working);
  return normalizeWhitespace(working);
}

/**
 * Split text into chunks no larger than `maxLen` characters, preferring to
 * break on sentence boundaries (Chinese/English punctuation, paragraph breaks).
 *
 * @param {string} text Source text.
 * @param {number} maxLen Maximum length per chunk.
 * @returns {string[]} Non-empty list of chunks (empty array if input is empty).
 */
function chunkText(text, maxLen) {
  if (typeof text !== 'string' || text.length === 0) {
    return [];
  }
  const limit = Number.isFinite(maxLen) && maxLen > 0 ? Math.floor(maxLen) : 4000;
  if (text.length <= limit) {
    return [text];
  }

  const chunks = [];
  let remaining = text;

  while (remaining.length > limit) {
    let cut = -1;
    const searchEnd = Math.min(remaining.length, limit);
    const punctuation = ['\n\n', '\n', '。', '！', '？', '!', '?', '.', '；', ';', '，', ','];
    for (const p of punctuation) {
      const idx = remaining.lastIndexOf(p, searchEnd);
      if (idx > Math.floor(limit / 2)) {
        cut = idx + p.length;
        break;
      }
    }
    if (cut <= 0) {
      cut = limit;
    }
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining.length > 0) {
    chunks.push(remaining);
  }
  return chunks.filter((c) => c.length > 0);
}

module.exports = {
  htmlToReadableText,
  chunkText
};
