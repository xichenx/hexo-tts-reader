'use strict';

const { resolveConfig } = require('./lib/config');
const { ReaderPipeline } = require('./lib/injector');
const { registerTag } = require('./lib/tag');
const { registerGenerator } = require('./lib/generator');

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
  const config = resolveConfig(userCfg);

  if (!config.enable) {
    ctx.log.info('hexo-reader: disabled via config');
    return;
  }

  const pipeline = new ReaderPipeline(ctx, config, ctx.log);

  registerTag(ctx, config);
  registerGenerator(ctx, pipeline);

  ctx.extend.filter.register('after_post_render', async function afterPostRender(data) {
    try {
      await pipeline.processPost(data);
    } catch (err) {
      if (config.failOnError) {
        throw err;
      }
      ctx.log.warn(`hexo-reader: ${err.message}`);
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
