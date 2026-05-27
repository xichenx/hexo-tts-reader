# hexo-reader

A Hexo plugin that reads your posts aloud. At build time it converts each post
into an MP3 using Microsoft Edge online TTS, caches the result, and injects a
floating audio player into the rendered page. The browser only ever loads a
static `<audio>` file — no runtime TTS server is required.

- Build-time synthesis (no client TTS / no API key)
- Content-hash cache: unchanged posts are not re-synthesized
- Auto-injection into post pages, or manual `{% reader %}` tag
- Floating player with play / pause / seek / speed (0.75x–2x)
- Light & dark themes, keyboard accessible
- Skips code blocks, scripts, styles, and embedded media

## Install

```bash
npm install hexo-reader --save
```

Requires Node.js >= 18 and Hexo >= 5.

## Configure

Add to your site's `_config.yml`:

```yaml
reader:
  enable: true
  autoInject: true
  voice: zh-CN-XiaoxiaoNeural
  rate: 0           # -100..100, relative percent
  pitch: 0          # -100..100, relative percent
  outputFormat: audio-24khz-48kbitrate-mono-mp3
  audioDir: audio
  cacheDir: .hexo-reader-cache
  position: bottom-right   # bottom-right | bottom-left | top-right | top-left
  buttonLabel: 朗读本文
  chunkSize: 4000          # split long posts into <= N chars per request
  maxTextLength: 100000    # hard upper bound per post
  failOnError: false       # if true, build fails when TTS fails
  timeoutMs: 60000
  skip: []                 # list of substrings to match against post.source
```

### Disable per-post

In a post's front-matter:

```yaml
---
title: My private post
reader: false
---
```

### Manual placement

Insert the player anywhere in a post with the `{% reader %}` tag. Auto-injection
will be suppressed for that post so you only get one player:

```markdown
Some intro text.

{% reader %}

The rest of the article.
```

## How it works

1. After Hexo renders a post, the plugin extracts a TTS-friendly plain-text
   representation from the HTML (code blocks and embedded media are removed).
2. A SHA-1 of `{ text, voice, rate, pitch, format }` becomes the cache key.
3. If `<cacheDir>/<key>.mp3` exists, it is reused; otherwise the plugin opens a
   WebSocket to Microsoft Edge TTS (via `msedge-tts`) and writes the result.
4. The generator emits the MP3 under `<audioDir>/<key>.mp3` plus a shared
   `reader.js` / `reader.css` under `assets/hexo-reader/`.
5. The player markup and a `<link>` / `<script>` snippet are appended to the
   post's content so it ships with the static site.

## Voices

Any voice supported by Microsoft Edge online TTS works. A few examples:

- `zh-CN-XiaoxiaoNeural` (default, female, Mandarin)
- `zh-CN-YunxiNeural` (male, Mandarin)
- `en-US-AriaNeural`
- `en-US-GuyNeural`
- `ja-JP-NanamiNeural`

## Cache

The cache lives at `<site>/<cacheDir>` and survives across builds. Delete the
folder to force re-synthesis. It is keyed on the *content*, not the file name,
so renames and minor edits regenerate only the affected posts.

## Notes & limitations

- Synthesis happens at build time and needs network access to Edge TTS.
- Each post becomes one MP3; very long posts are chunked and concatenated.
- If TTS fails for a post and `failOnError` is `false` (default), the player
  is simply not injected for that post and the build continues.

## License

MIT
