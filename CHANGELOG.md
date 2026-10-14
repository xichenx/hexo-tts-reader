# Changelog

## 0.3.0

- Add `hexo reader:inspect` and `hexo reader:preview` for final-script diagnostics and a short local voice sample.
- Reuse unchanged paragraph audio across article edits with an optional chunk cache; preserve existing whole-article cache hits.
- Report skipped, synthesized, cached, shared, and failed articles after each build, with chunk reuse counts.
- Localize player controls for eight languages, improve keyboard/screen-reader feedback, and refresh the floating UI.
- Add real Hexo command coverage, player interaction tests, and a Node/Hexo CI matrix.
- Pin the tested `msedge-tts` 2.1.0 release; a real Edge synthesis smoke test now succeeds where the previous locked client returned HTTP 403.

## 0.2.0

- Add per-post narration settings (`voice`, `autoVoice`, `rate`, `pitch`) and an optional spoken-only script (`reader.text`).
- Add site-wide and per-post pronunciation rules with longest-match, single-pass replacement.
- Skip unused TTS work in manual-only mode and share in-flight synthesis for identical posts.
- Inject shared player assets before the first render; preserve audio referenced by unchanged posts during incremental builds.
- Add real Hexo lifecycle coverage for first, incremental, and authored-narration builds.
