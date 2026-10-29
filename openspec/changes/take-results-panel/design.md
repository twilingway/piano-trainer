## Context

`ResultDialog` is one modal `GameDialog`: the summary, the whole `game-result-details` block and the
trouble notes, fed by `LiveResultDialog`, which reads the trainer snapshot's `stats` live. It opens
while the run is finished and the player is neither listening nor comparing. «Сравнить с оригиналом»
loads the take as a song, so the snapshot's stats then belong to the replay, not to the take.
«Настройки» is the existing non-modal side panel: `GameDialog modal={false}` positioned by
`.game-dialog.settings`.

## Goals / Non-Goals

**Goals:** the summary/details split from the specs; the panel's figures stay the take's while it is
reviewed and compared.

**Non-Goals:** a new stats model; changes to `PracticeStats`, `GameScore` or the review itself.

## Decisions

- **The details move into `ResultStats`.** The JSX of `game-result-details` (and the histogram)
  moves as is into `src/ui/ResultStats.tsx`, a `GameDialog modal={false}`. `ResultDialog` keeps the
  summary and trouble notes and gets `onStats`. Alternative — one component with a «details» mode —
  keeps the long file and mixes two dialogs' focus rules.
- **Frozen stats.** «Статистика» copies the finished `PracticeStats` into the windows' state
  (`ConnectedPlayerWindows`), and the panel renders that copy. Alternative — read the live snapshot
  like the result dialog — shows the replay's numbers during compare and the next run's while it
  plays.
- **Closing.** The copy is cleared by the panel's close, «Ещё раз», opening the next course task, a
  song change, and a run that starts outside comparing (the trainer is playing and not comparing).
  Review and compare keep it.
- **Layout.** `.game-dialog.result-stats` copies the settings panel's placement (fixed, right, below
  the header) at a narrower width; at `width <= 640px` it fills the screen (`inset: 0`, no radius).
- **Phones without review in CSS.** `@media (width <= 640px)` hides `.result-review-action` and
  `.review-bar`. A media query follows rotation and resizing without re-rendering; the review state
  itself is untouched, so widening the window shows the review again. Alternative — a JS
  `matchMedia` flag — adds state for what is purely presentational.

## Risks / Trade-offs

- [A review opened on a wide window keeps its staff marks after shrinking to a phone width] →
  accepted: on a phone it cannot be opened, only inherited from a resize.
- [Stats copied at the click miss a late update of the finished run] → the copy is taken from the
  finished snapshot, which no longer changes; the run is over before «Готово» opens.
