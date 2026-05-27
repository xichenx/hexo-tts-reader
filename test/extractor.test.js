'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { htmlToReadableText, chunkText } = require('../lib/extractor');
const { buildKey, AudioCache } = require('../lib/cache');
const { resolveConfig } = require('../lib/config');
const { buildPlayerMarkup, shouldSkipPost, joinUrlSegments } = require('../lib/injector');

test('htmlToReadableText strips tags and decodes entities', () => {
  const html = '<p>Hello&nbsp;<strong>World</strong> &amp; friends</p>';
  assert.equal(htmlToReadableText(html), 'Hello World & friends');
});

test('htmlToReadableText removes code blocks and scripts', () => {
  const html = [
    '<p>before</p>',
    '<pre><code>const x = 1;</code></pre>',
    '<script>alert(1)</script>',
    '<style>.a{color:red}</style>',
    '<p>after</p>'
  ].join('');
  const text = htmlToReadableText(html);
  assert.match(text, /before/);
  assert.match(text, /after/);
  assert.doesNotMatch(text, /const x/);
  assert.doesNotMatch(text, /alert/);
  assert.doesNotMatch(text, /color:red/);
});

test('htmlToReadableText handles paragraph breaks', () => {
  const html = '<p>第一段</p><p>第二段</p>';
  const text = htmlToReadableText(html);
  assert.ok(text.includes('第一段'));
  assert.ok(text.includes('第二段'));
  assert.ok(text.indexOf('\n') > -1);
});

test('htmlToReadableText returns empty for invalid input', () => {
  assert.equal(htmlToReadableText(''), '');
  assert.equal(htmlToReadableText(null), '');
  assert.equal(htmlToReadableText(undefined), '');
  assert.equal(htmlToReadableText(123), '');
});

test('chunkText respects max length', () => {
  const text = 'a'.repeat(100) + '。' + 'b'.repeat(100) + '。' + 'c'.repeat(100);
  const chunks = chunkText(text, 120);
  assert.ok(chunks.length >= 2);
  for (const c of chunks) {
    assert.ok(c.length <= 120 + 10);
  }
});

test('chunkText returns single chunk when under limit', () => {
  assert.deepEqual(chunkText('short', 100), ['short']);
});

test('chunkText returns empty array for empty input', () => {
  assert.deepEqual(chunkText('', 100), []);
});

test('buildKey is stable and changes with params', () => {
  const a = buildKey({ text: 'hello', voice: 'v1', rate: 0, pitch: 0, format: 'mp3' });
  const b = buildKey({ text: 'hello', voice: 'v1', rate: 0, pitch: 0, format: 'mp3' });
  const c = buildKey({ text: 'hello', voice: 'v2', rate: 0, pitch: 0, format: 'mp3' });
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[a-f0-9]{40}$/);
});

test('resolveConfig applies defaults', () => {
  const cfg = resolveConfig({});
  assert.equal(cfg.enable, true);
  assert.equal(cfg.voice, 'zh-CN-XiaoxiaoNeural');
  assert.equal(cfg.position, 'bottom-right');
  assert.equal(cfg.audioDir, 'audio');
});

test('resolveConfig clamps numeric ranges', () => {
  const cfg = resolveConfig({ rate: 9999, pitch: -9999, timeoutMs: 1 });
  assert.equal(cfg.rate, 100);
  assert.equal(cfg.pitch, -100);
  assert.equal(cfg.timeoutMs, 5000);
});

test('resolveConfig rejects path traversal in dirs', () => {
  const cfg = resolveConfig({ audioDir: '../escape', cacheDir: '../../bad' });
  assert.equal(cfg.audioDir, 'audio');
  assert.equal(cfg.cacheDir, '.hexo-reader-cache');
});

test('resolveConfig rejects unknown position', () => {
  const cfg = resolveConfig({ position: 'center' });
  assert.equal(cfg.position, 'bottom-right');
});

test('shouldSkipPost honors reader=false frontmatter', () => {
  assert.equal(shouldSkipPost({ reader: false, source: 'a.md' }, []), true);
  assert.equal(shouldSkipPost({ source: 'a.md' }, []), false);
});

test('shouldSkipPost honors skip patterns', () => {
  assert.equal(shouldSkipPost({ source: '_posts/draft/foo.md' }, ['draft/']), true);
  assert.equal(shouldSkipPost({ source: '_posts/release/foo.md' }, ['draft/']), false);
});

test('joinUrlSegments normalizes slashes', () => {
  assert.equal(joinUrlSegments('/', 'audio', 'x.mp3'), '/audio/x.mp3');
  assert.equal(joinUrlSegments('/blog/', '/audio/', '/x.mp3'), '/blog/audio/x.mp3');
});

test('buildPlayerMarkup escapes attributes', () => {
  const html = buildPlayerMarkup({
    audioUrl: '/a"b.mp3',
    position: 'bottom-right',
    buttonLabel: '<x>',
    postTitle: '"t"'
  });
  assert.ok(html.includes('&quot;b.mp3'));
  assert.ok(html.includes('&lt;x&gt;'));
  assert.ok(html.includes('data-position="bottom-right"'));
});

test('AudioCache rejects invalid keys', () => {
  const c = new AudioCache(require('os').tmpdir());
  assert.throws(() => c.pathFor('../escape'));
  assert.throws(() => c.pathFor(''));
  assert.throws(() => c.pathFor('not-hex!!'));
});

test('AudioCache write/read roundtrip', () => {
  const os = require('os');
  const path = require('path');
  const fs = require('fs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hexo-reader-test-'));
  try {
    const c = new AudioCache(dir);
    const key = 'a'.repeat(40);
    const data = Buffer.from('hello');
    c.write(key, data);
    assert.equal(c.has(key), true);
    assert.deepEqual(c.read(key), data);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
