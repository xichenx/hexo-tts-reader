'use strict';

const PLACEHOLDER = '<!--HEXO_READER_PLACEHOLDER-->';

/**
 * Register the `{% reader %}` Nunjucks tag. The tag emits a stable placeholder
 * that the `after_post_render` filter swaps with the real player markup once
 * the audio URL is known. It also marks the page so the filter does not
 * additionally append a second player.
 *
 * @param {object} hexo Hexo instance.
 * @param {object} _config Resolved plugin config (unused, kept for symmetry).
 */
function registerTag(hexo, _config) {
  hexo.extend.tag.register('reader', function tagFn(_args) {
    if (this && this.page) {
      this.page._hexoReaderTagged = true;
    }
    return PLACEHOLDER;
  });
}

module.exports = {
  registerTag,
  PLACEHOLDER
};
