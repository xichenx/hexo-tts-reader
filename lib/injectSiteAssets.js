'use strict';

const { joinUrlSegments, READER_JS_ROUTE, READER_CSS_ROUTE } = require('./injector');

/**
 * Register reader.css / reader.js site-wide via Hexo injector so assets live
 * outside #body-wrap and survive PJAX swaps (AnZhiYu, Butterfly, etc.).
 * Scripts use data-pjax so theme pjax:complete handlers re-run hexoReaderBoot().
 *
 * @param {object} ctx Hexo context.
 * @param {object} config Resolved plugin config.
 */
function registerSiteAssets(ctx, config) {
  if (!ctx || !ctx.extend || !ctx.extend.injector) {
    return;
  }

  const root = ctx.config.root || '/';
  const cssHref = joinUrlSegments(root, READER_CSS_ROUTE);
  const jsSrc = joinUrlSegments(root, READER_JS_ROUTE);

  const cssTag = `<link rel="stylesheet" href="${cssHref}" data-hexo-reader-css>`;
  const jsTag = `<script data-pjax src="${jsSrc}" data-hexo-reader-js></script>`;
  const bootTag = '<script data-pjax>if(window.hexoReaderBoot){window.hexoReaderBoot();}</script>';

  ctx.extend.injector.register('head_end', cssTag, 'default');
  ctx.extend.injector.register('body_end', jsTag + bootTag, 'default');
}

module.exports = {
  registerSiteAssets
};
