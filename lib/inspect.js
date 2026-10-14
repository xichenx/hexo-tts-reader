'use strict';

const fs = require('fs');
const path = require('path');
const frontMatter = require('hexo-front-matter');
const { AudioCache, buildKey } = require('./cache');
const { resolvePostConfig } = require('./config');
const { prepareNarrationText } = require('./narration');
const { planJobs, prepareSpeechText } = require('./tts');

function resolveSource(ctx, source) {
  if (typeof source !== 'string' || !source.trim()) {
    throw new Error('usage: hexo reader:inspect _posts/example.md');
  }
  const sourceDir = path.resolve(ctx.source_dir || path.join(ctx.base_dir, 'source'));
  const relative = source.replace(/^source[\\/]/, '');
  const absolute = path.resolve(sourceDir, relative);
  const within = path.relative(sourceDir, absolute);
  if (!within || within.startsWith('..') || path.isAbsolute(within)) {
    throw new Error('hexo-reader: source must be a file inside the Hexo source directory');
  }
  return { absolute, relative: within };
}

async function inspectPost(ctx, pipeline, source, sample = false) {
  const file = resolveSource(ctx, source);
  const sourceDir = path.resolve(ctx.source_dir || path.join(ctx.base_dir, 'source'));
  const realRoot = await fs.promises.realpath(sourceDir);
  const realFile = await fs.promises.realpath(file.absolute);
  const realRelative = path.relative(realRoot, realFile);
  if (!realRelative || realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
    throw new Error('hexo-reader: source must resolve inside the Hexo source directory');
  }
  const raw = await fs.promises.readFile(file.absolute, 'utf8');
  const front = frontMatter.parse(raw);
  const post = { ...front, content: front._content, source: file.relative };
  pipeline.inspectOnly = true;
  let rendered;
  try {
    rendered = await ctx.post.render(file.absolute, post);
  } finally {
    pipeline.inspectOnly = false;
  }
  const settings = resolvePostConfig(pipeline.config, rendered.reader);
  const text = prepareNarrationText(rendered.content, settings);
  const jobs = planJobs(prepareSpeechText(text), settings);
  const voices = Array.from(new Set(jobs.map((job) => job.voice)));
  ctx.log.info(`hexo-reader: ${file.relative} · ${text.length} characters · ${jobs.length} chunk(s)`);
  ctx.log.info(`hexo-reader: voice=${voices.join(', ') || settings.voice}; rate=${settings.rate}; pitch=${settings.pitch}`);
  ctx.log.info(`hexo-reader: final narration:\n${text || '(empty)'}`);
  if (!sample) return { text, jobs, voices };
  if (!jobs.length) throw new Error('hexo-reader: no narratable content to preview');

  const first = jobs[0];
  const sampleText = first.text.slice(0, 300);
  const key = buildKey({ text: sampleText, voice: first.voice,
    rate: settings.rate, pitch: settings.pitch, format: settings.outputFormat });
  const cache = new AudioCache(path.resolve(ctx.base_dir, settings.cacheDir, 'previews'));
  if (!cache.has(key)) {
    const audio = await pipeline.synthesizeAudio(sampleText, { ...settings, voice: first.voice, autoVoice: false });
    cache.write(key, audio);
  }
  ctx.log.info(`hexo-reader: sample audio: ${cache.pathFor(key)}`);
  return { text, jobs, voices, samplePath: cache.pathFor(key) };
}

function registerInspectCommands(ctx, pipeline) {
  if (!ctx.extend.console || !ctx.post || typeof ctx.post.render !== 'function') return;
  ctx.extend.console.register('reader:inspect', 'Inspect final narration without TTS', async function (args) {
    return inspectPost(ctx, pipeline, args && args._ && args._[0], false);
  });
  ctx.extend.console.register('reader:preview', 'Inspect narration and synthesize a short local sample', async function (args) {
    return inspectPost(ctx, pipeline, args && args._ && args._[0], true);
  });
}

module.exports = { inspectPost, registerInspectCommands, resolveSource };
