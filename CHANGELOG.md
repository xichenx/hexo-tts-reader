# Changelog

## 0.2.0 (Unreleased)

### Narration

- Add per-post narration settings (`voice`, `autoVoice`, `rate`, `pitch`) and an optional spoken-only script (`reader.text`).
- Add site-wide and per-post pronunciation rules with longest-match, single-pass replacement.
- Route voices automatically by article language or language segment, with configurable voice mappings and defaults for Chinese, English, Japanese, Korean, and Russian.
- Improve speech pacing with paragraph pauses, XML-safe SSML, and adjusted default rate and pitch.
- Add synthesis retries with exponential backoff and timeouts; reject empty or incomplete audio.
- Pin `msedge-tts` to the tested 2.1.0 release, resolving the HTTP 403 observed with the previously locked client in a real Edge synthesis smoke test.

### Player

- Redesign the floating player with a compact layout, light and dark themes, playback progress, elapsed and total time, and 10-second seek controls.
- Hide the headphone launcher while the player is expanded and restore it when the player collapses.
- Add a compact playback-speed menu with persistent speed selection.
- Support dragging and remembering the player position, with placement constrained to the viewport.
- Smooth opening and closing animations, handle rapid toggles, and respect reduced-motion preferences.
- Localize controls for eight languages and improve keyboard navigation, focus management, Escape handling, and screen-reader feedback.

### Caching and Hexo integration

- Reuse unchanged paragraph audio across article edits with an optional chunk cache, while preserving whole-article cache hits.
- Include voice routing and narration settings in cache keys; write cache files atomically.
- Add optional pruning of unused cache entries while preserving audio referenced by unchanged posts during incremental builds.
- Skip unused TTS work in manual-only mode and share in-flight synthesis for identical posts.
- Inject shared player assets before the first render.
- Report skipped, synthesized, cached, shared, and failed articles after each build, with chunk reuse counts.

### Tools and documentation

- Add `hexo reader:inspect` to inspect the final narration script, voice selection, and chunk plan without synthesizing audio.
- Add `hexo reader:preview` to generate a short local voice sample before building the site.
- Refresh the project identity and multilingual README headers, navigation, and setup documentation.
- Add player screenshots, a narrated article demo video, an animated preview, and an interactive example blog with sample audio.

### Tests and compatibility

- Add coverage for language detection and segmentation, configuration, retry behavior, cache management, and synthesis job planning.
- Add real Hexo lifecycle coverage for first, incremental, and authored-narration builds, plus CLI command and player interaction tests.
- Add a CI matrix covering Node.js 18, 20, and 22 with Hexo 5 and 7.
