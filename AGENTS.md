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
- **Every player-facing string is localized when it is written.** Any text a change adds to the
  interface (labels, hints, tooltips, `aria-label`, errors shown to the player) goes through `t()`
  with the Russian source text as the key, and the same change adds the entry with its English
  translation to a catalog in `src/i18n/` (`*Messages*.ts`). No hard-coded UI text, no "translate
  later". Keys are flat and a later catalog silently overrides an earlier one, so a Russian key must
  be unique across catalogs: if the same word means different things in two places, reword one.
  Write both languages the way a person would say it — short, plain, no bureaucratic phrasing.
- **UTF-8 for files and publishing.** Write text files, PR descriptions and issue bodies as UTF-8
  (without BOM unless a format requires it). On Windows, do not pipe Cyrillic text from PowerShell
  into Python or other native programs through the default console encoding: characters can become
  literal question marks before the file is written. Use a direct UTF-8 file write or an ASCII-safe
  byte transfer, pass multiline GitHub text with `--body-file`, and read the published body back to
  verify that it matches the local UTF-8 text. A successful CLI exit does not verify encoding.
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
  pure `string -> string` pass over the XML before OSMD renders it. A MIDI file's notes, timing and
  parts come from the MIDI itself; its staff is a score written from those notes (sixteenths, one
  voice per hand) and only shows them — never re-read the song from that score. Unless the player
  turns on «Живое исполнение из MIDI», the pure core puts the song's own notes on that same grid; it
  still does not read them back from the XML.
- **Fixed-shape art is baked.** In Pixi, anything that does not change per frame (finger digits, key
  stickers, note names) is drawn once into a texture and shown as a sprite; `Graphics` is only for
  baking.
- `local-lessons/` is ignored except for the exact score files and course manifest explicitly
  approved by the user on 2026-10-22 and allowlisted in `.gitignore`. Preserve that bounded set; new
  scores, videos, source documents and analysis stay local unless separately authorized. Never copy
  their music into `src/`.
- Local video lesson analysis for Codex, Claude Code and Qwen follows
  [video-lesson-analysis](.agents/skills/video-lesson-analysis/SKILL.md) and
  [docs/VIDEO_LESSON_PIPELINE.md](docs/VIDEO_LESSON_PIPELINE.md). Preserve source folders and name
  lessons after their directories. Record teacher finger observations separately from written and
  computed fingering. Analysis stays in `local-lessons/.analysis/`; reviewed course scores go only
  in `local-lessons/.course/`.

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

- Имя пакета — `twiling-keys`, название продукта — Twiling Keys для EN и Нотопад для RU. При
  оформлении PR из `dev` в `main` обновлять `package.json` до версии `0.0.<номер PR>` по
  фактическому номеру этого PR; эта версия отображается в информации о сборке. Получить номер можно
  созданием draft PR. PR задач в `dev` версию не меняют.

- Рабочая ветка пользователя — `dev`. Основная рабочая папка должна оставаться на `dev` после
  завершения задачи, чтобы пользователь запускал dev-сервер и проверял готовый результат.
- Every task starts a branch off an up-to-date `dev` and lands in `dev` through a pull request after
  `pnpm check` and `pnpm spec:validate` pass. The user checks `dev`; then a pull request from `dev`
  into `main` releases it. `main` takes pull requests from `dev` only (CI job `main-from-dev`), and
  neither `main` nor `dev` takes direct pushes. A task branch tracks its own remote branch, never
  `main` or `dev`.
- A feature's OpenSpec change is written and validated on its branch before the code.
- После слияния PR удалять его рабочую ветку на GitHub. В настройках репозитория держать включённым
  `Automatically delete head branches`. Ветки `main` и `dev` сохранять; ветки без влитого PR и с
  неопубликованной работой не удалять. При локальной очистке сохранять файлы worktree и удалять
  только проверенные устаревшие ветки.

## Local preview

- Порты. `http://localhost:5190/` — стенд пользователя: основная папка
  `E:\MySource\ReactJS\piano-trainer` на ветке `dev`. Его запускает и останавливает только
  пользователь; агенты не трогают ни этот сервер, ни ветку основной папки.
- Стенд задачи. Агент (Claude, Codex, opencode) может поднять стенд своей задачи без отдельного
  разрешения — только из своего worktree, на ветке задачи, на порту из диапазона `5191–5199`:
  `pnpm dev --port <порт> --strictPort`. Порт задаётся в задаче или брифе исполнителя; если не задан
  — первый свободный, проверенный перед запуском. `--strictPort` обязателен: без него Vite молча
  переезжает на соседний порт и занимает чужой.
- Стенд ветки по запросу. На просьбу пользователя «подними стенд ветки X» агент берёт существующий
  worktree этой ветки или создаёт новый в `E:\MySource\ReactJS\pt-agents\<имя>`, ставит зависимости
  (`pnpm install --frozen-lockfile`) и поднимает его на свободном порту из `5191–5199`. В отчёте —
  адрес, ветка, папка.
- Web MIDI работает на любом `http://localhost:<порт>`, но не на LAN-адресе. localStorage у каждого
  порта свой: уроки, настройки и история записей стенда задачи на `5190` не видны, и наоборот.
- Для каждого своего сервера агент записывает PID, порт, папку и ветку. После завершения, отмены или
  остановки задачи он останавливает свои серверы и их процессы запуска и проверяет, что порты
  освобождены. Оставлять сервер работающим можно только по явной просьбе пользователя. Чужие и
  неопознанные процессы не останавливать, не завершать все `node.exe` подряд.
- Не запускать серверы в отделённых фоновых процессах (`Start-Process`, `start`, `nohup` и аналоги),
  которые переживают терминал или сессию агента. Использовать управляемую сессию инструмента и
  завершать её перед итоговым отчётом. Закрытие VS Code само по себе не считается очисткой:
  проверять завершение своих процессов и освобождение портов.
- В VS Code для проекта отключены сохранение и восстановление терминалов:
  `terminal.integrated.enablePersistentSessions: false` и
  `terminal.integrated.persistentSessionReviveProcess: "never"` в `.vscode/settings.json`. Эти
  настройки не управляют отделёнными процессами агентов и не заменяют их явное завершение.

### Worktrees

- Одна задача — один worktree на своей ветке, вне папки проекта:
  `E:\MySource\ReactJS\pt-agents\<задача>`. Две сессии (или Claude и Codex) в одной рабочей папке
  переключают ветки друг другу; основная папка остаётся пользователю на `dev`.
- Не создавать worktree внутри папки проекта (`.worktrees/` и подобные): каждый несёт свой
  `node_modules`, и VS Code следит за ними и индексирует их. `.claude/worktrees/` создаёт сам
  харнесс Claude (изолированные субагенты); эти папки исключены из watcher, поиска и git-скана в
  `.vscode/settings.json`.
- Worktree влитой или брошенной задачи удалять (`git worktree remove <путь>`), когда в нём нет
  незакоммиченных и незапушенных изменений.

### Путь к просмотру

- После завершения задачи открыть PR её ветки в `dev`. После того как пользователь его вольёт,
  подтянуть `dev` в основную рабочую папку (`git pull --ff-only`), если пользователь об этом
  попросил, и проверить результат на `5190`. Не вливать ветки в `dev` локально и не пушить `dev`.
- Пока PR задачи не влит, результат показывается на стенде задачи (`5191–5199`) с явным указанием
  ветки и адреса. Итоговая проверка — на `5190` после слияния.
- Перед отчётом проверить, что сервер отдаёт актуальные файлы. Если горячее обновление сохраняет
  старое состояние урока, явно сообщить о необходимости перезагрузки страницы.
- PR в `dev` — путь задачи к просмотру, PR из `dev` в `main` — к релизу. Интеграция должна сохранять
  чужие изменения; если она заблокирована, сообщить конкретную причину, не утверждая, что правки уже
  видны.

## Delegation

- Delegate independent research, specification review, implementation and test review when doing so
  shortens the critical path.
- Use `spec_architect` before implementing a large or ambiguous change.
- Use `reviewer` after implementation and before declaring an OpenSpec change complete.
- Avoid having multiple write-capable agents edit the same files concurrently.
- Codex and the local Qwen implement bounded tasks in their own worktrees; Claude keeps specs,
  review and acceptance. The procedure is `.claude/skills/codex-worker/SKILL.md`.
- `ref2game` (`.agents/skills/ref2game`, vendored, unchanged) turns a reference image into a
  playable 2D slice on its own WebGL2 engine. Game projects go to the git-ignored `games/<name>`;
  only accepted assets move into `src`.

## Game development skills

- Four vendored skills are available in `.agents/skills/`: `performance-optimization`,
  `threejs-materials-lighting`, `create-game-assets`, and `shader-programming`. Use only the skill
  relevant to the current task.
- Source revision, license and project-specific usage are recorded in
  [.agents/skills/GAMEDEV_SKILLS.md](.agents/skills/GAMEDEV_SKILLS.md).
- Adapt examples to the existing renderer and `PracticeSession` clock. Keep musical timing,
  pure-core boundaries, localization and the existing asset workflow defined by this project.

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
