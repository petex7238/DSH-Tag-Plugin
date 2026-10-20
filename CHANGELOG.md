# Changelog

All notable changes to this plugin. Versions follow SemVer; the plugin is a
bundle for DeepSeek Harness, so "breaking" means an incompatible `dsh` change.

## 0.1.0

First public release.

- **Mark** a code block or a sentence in an assistant answer: select it, pick a
  tag from the floating bar, and it is stored outside the transcript.
- **Edge rail**: one deep-blue bar per mark on the upper **left** edge of the
  conversation, shaped like the shell's own turn ticks — which occupy the right
  edge, so the two rails never overlap. Hover opens the card to the bar's right;
  click jumps; right-click opens a menu (jump / rename / delete); delete keeps a
  5-second undo.
- **Per-mark names**: rename a mark from the rail's context menu (inline field,
  Enter saves, Esc cancels, empty falls back to the quote). A name belongs to
  that one mark — the tag stays shared — and wins over the tag in the tooltip,
  the sidebar list and the bar's accessible label.
- **Right-sidebar tab**「标记」: filter by tag, search, per-mark notes, tag
  management (create / rename / recolor / delete).
- **Precise jumping**: four-level anchor fallback (anchor key → node key →
  exact quote → context scoring with whitespace-insensitive matching), paging
  history in via `loadOlder()` when the target is not loaded yet.
- **Centred, instant landing**: the marked Range is centred in the readable
  band (column minus composer), with no scroll animation.
- **Highlights** via the CSS Custom Highlight API, so re-renders and streaming
  updates cannot drop them.
- Marking **never opens the right column**; confirmation is a 1.5s toast at the
  selection.
- All data stays in `localStorage`; no network calls, no host-side logic.
- 100 headless-Chrome assertions in `tools/harness/`.
