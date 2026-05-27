'use strict';

const fs = require('fs');
const path = require('path');
const { READER_JS_ROUTE, READER_CSS_ROUTE } = require('./injector');

const ASSETS_DIR = path.resolve(__dirname, '..', 'assets');

function readAssetSync(name) {
  return fs.readFileSync(path.join(ASSETS_DIR, name));
}

/**
 * Register the generator that emits:
 *  - shared reader.js / reader.css under /assets/hexo-reader/
 *  - per-post MP3 files queued by the pipeline
 *
 * @param {object} hexo Hexo instance.
 * @param {ReaderPipeline} pipeline Shared pipeline instance.
 */
function registerGenerator(hexo, pipeline) {
  hexo.extend.generator.register('hexo-reader', function generate(_locals) {
    const items = [];

    try {
      items.push({ path: READER_JS_ROUTE, data: readAssetSync('reader.js') });
      items.push({ path: READER_CSS_ROUTE, data: readAssetSync('reader.css') });
    } catch (err) {
      hexo.log.warn(`hexo-reader: failed to bundle client assets: ${err.message}`);
    }

    for (const entry of pipeline.buildGeneratorOutputs()) {
      items.push(entry);
    }
    return items;
  });
}

module.exports = {
  registerGenerator,
  ASSETS_DIR
};
