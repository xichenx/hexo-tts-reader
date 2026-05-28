# hexo-tts-reader

> A Hexo plugin that reads your posts aloud. It builds an MP3 for each post at
> **generate-time** using Microsoft Edge online TTS, caches the result, and
> injects a floating audio player into the rendered page.

[![npm version](https://img.shields.io/npm/v/hexo-tts-reader.svg)](https://www.npmjs.com/package/hexo-tts-reader)
[![node](https://img.shields.io/node/v/hexo-tts-reader.svg)](https://nodejs.org/)
[![license](https://img.shields.io/npm/l/hexo-tts-reader.svg)](./LICENSE)

The browser only ever loads a static `<audio>` file — no runtime TTS server,
no API key, no client-side JavaScript synthesis.

---

## Features

- **Build-time synthesis** — no runtime TTS service, no API key required
- **Content-hash cache** — unchanged posts are not re-synthesized between builds
- **Auto-injection** into post pages, or manual `{% reader %}` tag for precise placement
- **Floating player** with play / pause / seek / playback speed (0.75× – 2×)
- **Light & dark themes**, keyboard accessible
- **Smart text extraction** — skips code blocks, scripts, styles, and embedded media
- **Long-post safe** — chunks input on sentence boundaries and concatenates MP3 frames
- **Per-post opt-out** via front-matter

---

## Requirements

- Node.js **>= 18**
- Hexo **>= 5**
- Network access to Microsoft Edge online TTS at build time

---

## Install

```bash
npm install hexo-tts-reader --save
```

or with `yarn` / `pnpm`:

```bash
yarn add hexo-tts-reader
pnpm add hexo-tts-reader
```

---

## Quick Start

1. Install the plugin.
2. Add the following to your site's `_config.yml`:

   ```yaml
   reader:
     enable: true
   ```

3. Run `hexo clean && hexo generate` (or `hexo server`). Each post page will
   gain a floating "朗读本文" button in the bottom-right corner.

That's it. On subsequent builds, the content-hash cache means only changed
posts hit the TTS service.

---

## Configuration

Full config with defaults:

```yaml
reader:
  enable: true
  autoInject: true
  voice: zh-CN-XiaoxiaoNeural
  rate: 0                                    # -100..100, relative percent
  pitch: 0                                   # -100..100, relative percent
  outputFormat: audio-24khz-48kbitrate-mono-mp3
  audioDir: audio                            # public audio output dir
  cacheDir: .hexo-reader-cache               # local cache dir (gitignore it)
  position: bottom-right                     # bottom-right | bottom-left | top-right | top-left
  buttonLabel: 朗读本文
  chunkSize: 4000                            # split long posts into <= N chars per request
  maxTextLength: 100000                      # hard upper bound per post
  failOnError: false                         # if true, build fails when TTS fails
  timeoutMs: 60000                           # per-chunk TTS timeout (ms)
  skip: []                                   # list of substrings to match against post.source
```

### Option reference

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `enable` | boolean | `true` | Master switch. |
| `autoInject` | boolean | `true` | Append the player to every post automatically. Disable if you only want to use `{% reader %}`. |
| `voice` | string | `zh-CN-XiaoxiaoNeural` | Any Microsoft Edge online TTS voice id. |
| `rate` | number | `0` | Relative speech rate, `-100..100`. Out-of-range values are clamped. |
| `pitch` | number | `0` | Relative pitch, `-100..100`. Out-of-range values are clamped. |
| `outputFormat` | string | `audio-24khz-48kbitrate-mono-mp3` | Any format supported by `msedge-tts`. |
| `audioDir` | string | `audio` | Public path under the site root where MP3s are emitted. Path traversal is rejected. |
| `cacheDir` | string | `.hexo-reader-cache` | Local cache dir (resolved from your site's base dir). Survives across builds. |
| `position` | enum | `bottom-right` | One of `bottom-right`, `bottom-left`, `top-right`, `top-left`. |
| `buttonLabel` | string | `朗读本文` | Aria-label / tooltip of the toggle button. |
| `chunkSize` | number | `4000` | Max characters per TTS request, `200..8000`. |
| `maxTextLength` | number | `100000` | Hard cap per post, `100..1000000`. Longer text is truncated. |
| `failOnError` | boolean | `false` | When `true`, a TTS failure aborts the whole `hexo generate`. |
| `timeoutMs` | number | `60000` | Per-chunk WebSocket timeout, `5000..600000`. |
| `skip` | string[] | `[]` | Substrings matched against `post.source` to skip selected posts. |

### Disable per-post

In a post's front-matter:

```yaml
---
title: My private post
reader: false
---
```

### Manual placement

Insert the player anywhere in a post with the `{% reader %}` tag. When the tag
is present, auto-injection is suppressed for that post so you only get one
player:

```markdown
Some intro text.

{% reader %}

The rest of the article.
```

### Skipping by path

```yaml
reader:
  skip:
    - "draft/"
    - "_posts/private/"
```

Any post whose `source` contains one of the substrings above is skipped.

---

## How it works

1. After Hexo renders a post (`after_post_render` filter), the plugin extracts
   a TTS-friendly plain-text representation from the HTML. Code blocks,
   scripts, styles, and embedded media are removed.
2. A SHA-1 of `{ text, voice, rate, pitch, format }` becomes the cache key.
3. If `<cacheDir>/<key>.mp3` already exists, it is reused. Otherwise the
   plugin opens a WebSocket to Microsoft Edge TTS (via [`msedge-tts`][msedge])
   and writes the result atomically (`*.tmp` → rename).
4. Long inputs are chunked on sentence boundaries (Chinese & English
   punctuation), synthesized chunk-by-chunk, and concatenated as raw MP3
   frames — which is safe for playback.
5. The generator emits the MP3 under `<audioDir>/<key>.mp3`, plus a shared
   `reader.js` / `reader.css` under `assets/hexo-reader/`.
6. The player markup and a `<link>` / `<script>` snippet are appended to the
   post's content so it ships with the static site.

[msedge]: https://www.npmjs.com/package/msedge-tts

---

## Voices

Any voice supported by Microsoft Edge online TTS works. A few examples:

| Voice id | Locale | Notes |
| --- | --- | --- |
| `zh-CN-XiaoxiaoNeural` | zh-CN | Default, female |
| `zh-CN-YunxiNeural` | zh-CN | Male |
| `zh-CN-YunyangNeural` | zh-CN | Male, news-style |
| `en-US-AriaNeural` | en-US | Female |
| `en-US-GuyNeural` | en-US | Male |
| `ja-JP-NanamiNeural` | ja-JP | Female |
| `ko-KR-SunHiNeural` | ko-KR | Female |

For a full list, see the upstream voice catalogue or run a `voices` query via
`msedge-tts`.

---

## Cache

- The cache lives at `<site>/<cacheDir>` and survives across builds.
- It is keyed on the **content**, not the file name, so renames don't trigger
  re-synthesis and minor edits regenerate only the affected posts.
- To force a full re-synthesis, delete the cache directory.
- Recommended `.gitignore` entry:

  ```gitignore
  .hexo-reader-cache/
  ```

---

## Theming

The injected player uses CSS classes prefixed with `hexo-reader__`. To
customize colors, override them in your theme's stylesheet, for example:

```css
.hexo-reader__toggle {
  background: #1f6feb;
  color: #fff;
}
.hexo-reader__panel {
  border-radius: 12px;
}
```

The player respects `prefers-color-scheme: dark` out of the box.

---

## Troubleshooting

**The build hangs or times out on `hexo generate`.**
Your build needs network access to Edge TTS. If you're behind a firewall or
running offline, set `failOnError: false` (default) so failures degrade
gracefully, or skip the affected posts via `skip`.

**A post has no player after build.**
Check the Hexo log for `hexo-reader: TTS failed for "<title>"`. If TTS failed
and `failOnError` is `false`, the player is silently skipped for that post.

**The player appears twice in a post.**
Don't combine `autoInject: true` with the `{% reader %}` tag in the same post.
The plugin already suppresses auto-injection when the tag is present — make
sure the tag is rendered (not commented out) and that no theme template adds
its own copy.

**Audio doesn't play / 404.**
Make sure your deployment includes the `audio/` and `assets/hexo-reader/`
directories. If you set a non-default `audioDir`, ensure it's not blocked by
your CDN rules.

**I want to ship the site without ever calling TTS.**
Pre-populate `<cacheDir>` with previously-generated MP3 files. The plugin
re-uses them by content hash without hitting the network.

---

## Notes & limitations

- Synthesis happens at build time and needs network access to Edge TTS.
- Each post becomes one MP3; very long posts are chunked and concatenated.
- If TTS fails for a post and `failOnError` is `false` (default), the player
  is simply not injected for that post and the build continues.
- The cache key is a SHA-1 of plain text + synthesis params. It is used as a
  content identifier only, not for security.

---

## Development

```bash
git clone https://github.com/xichenx/hexo-tts-reader.git
cd hexo-tts-reader
npm install
npm test
```

Tests use the built-in Node test runner (`node --test`).

---

## License

[MIT](./LICENSE) © 刘明智(xichen)
