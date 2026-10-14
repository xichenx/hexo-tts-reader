'use strict';

const { htmlToReadableText } = require('./extractor');

/** Replace exact terms in a single pass, preferring longer phrases. */
function applyPronunciations(text, entries, maxLength) {
  const limit = Number.isFinite(maxLength) && maxLength > 0 ? Math.floor(maxLength) : 100000;
  const source = typeof text === 'string' ? text : '';
  const terms = (Array.isArray(entries) ? entries : [])
    .filter((entry) => entry && typeof entry.from === 'string' && entry.from !== '' && typeof entry.to === 'string')
    .sort((a, b) => b.from.length - a.from.length);
  if (terms.length === 0) {
    return source.slice(0, limit);
  }

  const output = [];
  let length = 0;
  for (let i = 0; i < source.length && length < limit;) {
    const match = terms.find((entry) => source.startsWith(entry.from, i));
    const piece = match ? match.to : source[i];
    const bounded = piece.slice(0, limit - length);
    output.push(bounded);
    length += bounded.length;
    i += match ? match.from.length : 1;
  }
  return output.join('');
}

/** Select the authored speech script or extract it from rendered HTML. */
function prepareNarrationText(html, postConfig) {
  const options = postConfig || {};
  const script = options.text;
  const source = typeof script === 'string' && script.trim() !== ''
    ? script.replace(/\r\n?/g, '\n').trim()
    : htmlToReadableText(html);
  return applyPronunciations(source, options.pronunciations, options.maxTextLength).trim();
}

module.exports = {
  applyPronunciations,
  prepareNarrationText
};
