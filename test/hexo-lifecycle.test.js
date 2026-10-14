'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { setup } = require('../index');
const { AudioCache, buildKey } = require('../lib/cache');
const { resolveConfig } = require('../lib/config');
const { htmlToReadableText } = require('../lib/extractor');

let Hexo;
try {
  Hexo = require('hexo');
} catch (_err) {
  // Hexo is an optional peer dependency, so the normal test suite runs without it.
}

test('Hexo generates site assets and preserves audio across incremental builds',
  { skip: !Hexo }, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hexo-reader-hexo-'));
    const postsDir = path.join(dir, 'source', '_posts');
    const layoutDir = path.join(dir, 'themes', 'fixture', 'layout');
    fs.mkdirSync(postsDir, { recursive: true });
    fs.mkdirSync(layoutDir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      name: 'hexo-reader-fixture',
      private: true,
      hexo: { version: Hexo.version }
    }));
    fs.writeFileSync(path.join(dir, '_config.yml'), [
      'title: Reader fixture',
      'url: https://example.com',
      'root: /',
      'theme: fixture'
    ].join('\n'));
    fs.writeFileSync(path.join(layoutDir, 'post.fixture'), 'post layout');

    const firstText = '第一篇文章有足够的文字可以朗读。';
    const secondText = '第二篇文章同样包含可朗读的文字。';
    const updatedText = '第一篇文章已经更新为新的朗读内容。';
    const firstPath = path.join(postsDir, 'first.md');
    const secondPath = path.join(postsDir, 'second.md');
    const postSource = (title, text) => `---\ntitle: ${title}\n---\n${text}`;
    fs.writeFileSync(firstPath, postSource('First', firstText));
    fs.writeFileSync(secondPath, postSource('Second', secondText));

    const config = resolveConfig({ autoVoice: false, pruneCache: true });
    const cache = new AudioCache(path.join(dir, config.cacheDir));
    const audioKey = (value) => buildKey({
      text: htmlToReadableText(`<p>${value}</p>`),
      voice: config.voice, rate: config.rate, pitch: config.pitch,
      format: config.outputFormat
    });
    const firstKey = audioKey(firstText);
    const secondKey = audioKey(secondText);
    const updatedKey = audioKey(updatedText);
    const orphanKey = 'f'.repeat(40);
    cache.write(firstKey, Buffer.from('FIRST'));
    cache.write(secondKey, Buffer.from('SECOND'));
    cache.write(orphanKey, Buffer.from('ORPHAN'));

    const ctx = new Hexo(dir, { silent: true });
    try {
      await ctx.init();
      ctx.extend.renderer.register('md', 'html', (data) => `<p>${data.text.trim()}</p>`);
      ctx.extend.renderer.register('fixture', 'html', (_data, locals) =>
        `<html><head></head><body>${locals.page.content}</body></html>`);
      ctx.config.reader = { autoVoice: false, pruneCache: true };
      setup(ctx);
      const renderedSources = [];
      ctx.extend.filter.register('after_post_render', (post) => {
        renderedSources.push(post.source);
        return post;
      });

      await ctx.call('generate', {});
      assert.deepEqual(renderedSources.sort(), ['_posts/first.md', '_posts/second.md']);
      const firstRoute = ctx.model('Post').findOne({ source: '_posts/first.md' }).path;
      const firstOutput = path.join(dir, 'public', firstRoute, 'index.html');
      const firstHtml = fs.readFileSync(firstOutput, 'utf8');
      assert.match(firstHtml, /data-hexo-reader-css/);
      assert.match(firstHtml, /data-hexo-reader-js/);
      assert.match(firstHtml, /class="hexo-reader"/);
      assert.ok(fs.existsSync(path.join(dir, 'public', 'audio', `${firstKey}.mp3`)));
      assert.ok(fs.existsSync(path.join(dir, 'public', 'audio', `${secondKey}.mp3`)));
      assert.equal(cache.has(orphanKey), false, 'full build should prune orphan audio');

      cache.write(updatedKey, Buffer.from('UPDATED'));
      fs.writeFileSync(firstPath, postSource('First', updatedText));
      const future = new Date(Date.now() + 2000);
      fs.utimesSync(firstPath, future, future);
      renderedSources.length = 0;
      await ctx.call('generate', {});
      assert.deepEqual(renderedSources, ['_posts/first.md']);

      const updatedHtml = fs.readFileSync(firstOutput, 'utf8');
      assert.ok(updatedHtml.includes(`${updatedKey}.mp3`));
      assert.ok(fs.existsSync(path.join(dir, 'public', 'audio', `${updatedKey}.mp3`)));
      assert.ok(fs.existsSync(path.join(dir, 'public', 'audio', `${secondKey}.mp3`)));
      assert.ok(cache.has(secondKey), 'incremental build must retain unchanged post audio');

      renderedSources.length = 0;
      await ctx.call('generate', {});
      assert.deepEqual(renderedSources, []);
      assert.ok(cache.has(secondKey), 'no-op build must retain unchanged post audio');
    } finally {
      ctx.unwatch();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

test('Hexo front matter controls the authored narration and cache route',
  { skip: !Hexo }, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hexo-reader-script-'));
    const postsDir = path.join(dir, 'source', '_posts');
    const layoutDir = path.join(dir, 'themes', 'fixture', 'layout');
    fs.mkdirSync(postsDir, { recursive: true });
    fs.mkdirSync(layoutDir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      name: 'hexo-reader-script-fixture', private: true, hexo: { version: Hexo.version }
    }));
    fs.writeFileSync(path.join(dir, '_config.yml'), [
      'title: Narration fixture', 'url: https://example.com', 'root: /', 'theme: fixture'
    ].join('\n'));
    fs.writeFileSync(path.join(layoutDir, 'post.fixture'), 'post layout');
    fs.writeFileSync(path.join(postsDir, 'custom.md'), [
      '---',
      'title: Custom narration',
      'reader:',
      '  voice: zh-CN-YunxiNeural',
      '  rate: -15',
      '  pitch: 3',
      '  text: |',
      '    欢迎来到 Hexo。',
      '---',
      '网页显示不同的文字。'
    ].join('\n'));

    const config = resolveConfig({ pronunciations: { Hexo: '黑克搜' } });
    const key = buildKey({
      text: '欢迎来到 黑克搜。', voice: 'zh-CN-YunxiNeural',
      rate: -15, pitch: 3, format: config.outputFormat
    });
    const cache = new AudioCache(path.join(dir, config.cacheDir));
    cache.write(key, Buffer.from('CUSTOM-AUDIO'));
    const ctx = new Hexo(dir, { silent: true });
    try {
      await ctx.init();
      ctx.extend.renderer.register('md', 'html', (data) => `<p>${data.text.trim()}</p>`);
      ctx.extend.renderer.register('fixture', 'html', (_data, locals) =>
        `<html><head></head><body>${locals.page.content}</body></html>`);
      ctx.config.reader = { pronunciations: { Hexo: '黑克搜' }, failOnError: true, retries: 0 };
      setup(ctx);
      const inspected = await ctx.call('reader:inspect', { _: ['_posts/custom.md'] });
      assert.equal(inspected.text, '欢迎来到 黑克搜。');
      assert.deepEqual(inspected.voices, ['zh-CN-YunxiNeural']);
      await ctx.call('generate', {});

      const post = ctx.model('Post').findOne({ source: '_posts/custom.md' });
      const html = fs.readFileSync(path.join(dir, 'public', post.path, 'index.html'), 'utf8');
      assert.ok(html.includes(`audio/${key}.mp3`));
      assert.ok(html.includes('网页显示不同的文字。'));
      assert.ok(fs.existsSync(path.join(dir, 'public', 'audio', `${key}.mp3`)));
    } finally {
      ctx.unwatch();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
