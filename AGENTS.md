# Piano Trainer — repository instructions

## Product

A browser piano trainer in the spirit of Synthesia and EveryonePiano. A digital piano connects over
USB MIDI (Web MIDI in Chrome or Edge); the computer keyboard and the mouse stand in for it. A song
falls onto an on-screen keyboard as notes, each carrying the finger that plays it, while the score
scrolls above under a cursor. The trainer solves the fingering itself, waits for the right key or
plays in tempo, plays the other hand, records every take and compares it with the score.

## Working agreements

- Strict TypeScript everywhere. Identifiers and code comments in English; player-facing UI strings,
  product docs and OpenSpec artifacts in Russian.
- pnpm, never npm. Linter and formatter are ESLint + Prettier, not Biome.
- **Pure core, thin shell.** `src/fingering`, `src/song`, `src/practice/session.ts` and
  `src/recording` (except `history.ts`, which touches `localStorage`) are pure TypeScript: no React,
  no Pixi, no DOM beyond `DOMParser`/`XMLSerializer` for MusicXML, no timers. They are where the
  behaviour lives and where the tests are. React, Pixi (`src/render`), OSMD (`src/staff`) and
  Tone.js (`src/audio`) only draw, sound and wire input.
- **One clock.** Song time comes from `PracticeSession`; the falling notes, the staff cursor, the
  metronome and a take's song-time stamps all read it. Nothing else advances the song.
- **A score is the source.** MusicXML carries hands (staves), measures, beats and written fingering;
  every staff feature (fingers, names, chords, line breaks, transposition, a take written out) is a
  pure `string -> string` pass over the XML before OSMD renders it. MIDI files get falling notes and
  a guessed hand split; do not pretend a MIDI file has a score.
- **Fixed-shape art is baked.** In Pixi, anything that does not change per frame (finger digits, key
  stickers, note names) is drawn once into a texture and shown as a sprite; `Graphics` is only for
  baking.
- `local-lessons/` is git-ignored on purpose: scores there may not be published (the repository is
  public). Never add its files to a commit, and never copy their music into `src/`.

## Code layout

Where a new file goes, how big a module may grow (500 lines, held by ESLint) and what `App.tsx` may
hold (composition only) are in `docs/CODE_STYLE.md`. Read it before adding a file or a branch to an
existing one.

## Spec-driven workflow

- Use `$openspec-workflow` for features, architecture changes and non-trivial refactors.
- Do not start production implementation while material product decisions in the active change are
  unresolved.
- Keep acceptance scenarios observable and testable.
- Small fixes and UI tweaks the user asks for directly do not need an OpenSpec change.

## Branches

- Рабочая ветка пользователя — `dev`. Основная рабочая папка должна оставаться на `dev` после
  завершения задачи, чтобы пользователь запускал dev-сервер и проверял готовый результат.
- Every task starts a branch off an up-to-date `main` and lands through a pull request after
  `pnpm check` and `pnpm spec:validate` pass. `main` only receives reviewed merges.
- A feature's OpenSpec change is written and validated on its branch before the code.

## Local preview

- Единый адрес просмотра для пользователя: `http://localhost:5190/`. Сервер должен обслуживать
  основную рабочую папку `E:\MySource\ReactJS\piano-trainer`.
- После завершения задачи в отдельной ветке или worktree влить все её готовые изменения в `dev` с
  сохранением чужой работы, переключить основную рабочую папку на `dev` и проверить результат на
  этом сервере до отчёта пользователю. Не оставлять готовые правки только в рабочей ветке или
  worktree и не подменять просмотр другим портом.
- Пользователь запускает `pnpm dev` из основной рабочей папки на ветке `dev` и смотрит результат по
  адресу `http://localhost:5190/`.
- Перед отчётом проверить, что сервер отдаёт актуальные файлы. Если горячее обновление сохраняет
  старое состояние урока, явно сообщить о необходимости перезагрузки страницы.
- PR используется для ревью и внесения изменений в `main`; ожидание PR не должно задерживать
  доступность готовых локальных правок. Интеграция должна сохранять чужие изменения; если она
  заблокирована, сообщить конкретную причину, не утверждая, что правки уже видны.

## Delegation

- Delegate independent research, specification review, implementation and test review when doing so
  shortens the critical path.
- Use `spec_architect` before implementing a large or ambiguous change.
- Use `reviewer` after implementation and before declaring an OpenSpec change complete.
- Avoid having multiple write-capable agents edit the same files concurrently.
- Codex and the local Qwen implement bounded tasks in their own worktrees; Claude keeps specs,
  review and acceptance. The procedure is `.claude/skills/codex-worker/SKILL.md`.

## Verification

Before declaring a change complete, run the narrowest relevant checks and then:

```text
pnpm check
pnpm spec:validate
```

Report commands that could not run and the exact reason. Browser behaviour that depends on the
animation frame (scrolling, falling notes, playback) cannot be seen in a hidden browser pane: say so
instead of claiming it works.

## Definition of done

- Behaviour matches the accepted OpenSpec artifacts, when there is a change.
- Pure modules have tests that would fail if the behaviour were wrong (fingering, parsing,
  transposition, session timing, take comparison, transcription).
- Settings the user can change survive a reload when they are preferences, and are reset when they
  belong to a song.
- `pnpm check` is green.

## Safety

- Never commit credentials, tokens or personal data.
- Ask before adding a production dependency that is not part of an accepted OpenSpec design.
- Downloaded third-party scores and samples stay out of git unless their licence allows publishing.
