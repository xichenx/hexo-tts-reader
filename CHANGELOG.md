# Changelog

## 0.2.0

- Add per-post narration settings (`voice`, `autoVoice`, `rate`, `pitch`) and an optional spoken-only script (`reader.text`).
- Add site-wide and per-post pronunciation rules with longest-match, single-pass replacement.
- Skip unused TTS work in manual-only mode and share in-flight synthesis for identical posts.
- Inject shared player assets before the first render; preserve audio referenced by unchanged posts during incremental builds.
- Add real Hexo lifecycle coverage for first, incremental, and authored-narration builds.
