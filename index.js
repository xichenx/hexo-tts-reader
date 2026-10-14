'use strict';

const { resolveConfig } = require('./lib/config');
const { ReaderPipeline } = require('./lib/injector');
const { registerSiteAssets } = require('./lib/injectSiteAssets');
const { registerTag } = require('./lib/tag');
const { registerGenerator } = require('./lib/generator');
const { registerInspectCommands } = require('./lib/inspect');

function getHexo() {
  if (typeof hexo !== 'undefined' && hexo) {
    return hexo;
  }
  return null;
}

function setup(ctx) {
  if (!ctx || !ctx.extend) {
    return;
  }
  const userCfg = (ctx.config && ctx.config.reader) || {};
  const config = resolveConfig(userCfg, ctx.config && ctx.config.language);

  if (!config.enable) {
    ctx.log.info('hexo-reader: disabled via config');
    return;
  }

  const pipeline = new ReaderPipeline(ctx, config, ctx.log);
  if (typeof ctx.on === 'function') {
    ctx.on('generateBefore', () => pipeline.beginGeneration());
  }

  registerTag(ctx, config);
  registerSiteAssets(ctx, config);
  registerGenerator(ctx, pipeline);
  registerInspectCommands(ctx, pipeline);

  ctx.extend.filter.register('after_generate', () => {
    pipeline.report();
    if (config.pruneCache) {
      try {
        pipeline.pruneCache();
      } catch (err) {
        ctx.log.warn(`hexo-reader: cache prune failed: ${err.message}`);
      }
    }
  });

  ctx.extend.filter.register('after_post_render', async function afterPostRender(data) {
    if (pipeline.inspectOnly) return data;
    try {
      await pipeline.processPost(data);
    } catch (err) {
      if (config.failOnError) {
        throw err;
      }
      ctx.log.warn(`hexo-reader: ${err.message}`);
      pipeline.record(data, 'failed', err.message);
    }
    return data;
  });
}

const ctx = getHexo();
if (ctx) {
  setup(ctx);
}

module.exports = {
  setup,
  resolveConfig
};
