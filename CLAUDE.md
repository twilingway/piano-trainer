# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository. `AGENTS.md`
holds the working agreements (product, boundaries, definition of done) and applies here too; this
file covers commands, architecture and agent tooling.

## Commands

Node 22+ and pnpm 10.34.5. On this machine PowerShell blocks `pnpm.ps1`: run `pnpm.cmd` there, or
use Git Bash.

```bash
pnpm dev
```

Vite on port 5190, listening on every interface. Web MIDI only works on `http://localhost:5190` (or
https): Chrome hides it on a plain-http LAN address.

Full gate before declaring work complete — format, lint, typecheck, unit tests, build:

```bash
pnpm check
```

Narrower checks: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm format`. One test
file or case:

```bash
pnpm exec vitest run src/fingering/fingering.test.ts -t "inversions"
```

OpenSpec: `pnpm spec list`, `pnpm spec status --change <name>`, `pnpm spec:validate`.

Vite's file watcher on this drive sometimes misses a second edit made right after the first: the
browser then runs a stale module. `touch` the edited files, or restart `pnpm dev`.

## Architecture

```text
src/fingering   Viterbi fingering over an ergonomic span table (pure)
src/song        the Song model; MusicXML and MIDI readers; MusicXML passes (fingering, names,
                chords, line breaks, transposition); harmony (chords, key); built-in and local lessons
src/practice    PracticeSession (pure: song time, wait/tempo modes, seek, metronome events) and
                Trainer (the frame loop that joins session, view, sound, keys and recording)
src/recording   takes (TakeRecorder), comparison with the score, transcription into MusicXML,
                playback as a song, MIDI export, history in localStorage
src/render      Pixi view: falling notes, keyboard, key stickers; keyboard layout (pure)
src/staff       OSMD staff: cursor by beats, marks, zoom, line layout, live scrolling
src/audio       Tone.js sampler (Salamander samples from tonejs.github.io) and metronome click
src/input       Web MIDI (keys and the sustain pedal) and the computer keyboard
local-lessons   git-ignored MusicXML lessons: one folder a lesson, one file a level
```

`App.tsx` composes all of it. The trainer and its Pixi view are created once and live outside React;
React sends commands and reads throttled snapshots.

## Spec-driven workflow

OpenSpec is the source of truth for intended behaviour. Features, architecture changes and
non-trivial refactors go through `openspec/changes/<name>/` (proposal, delta specs, design, tasks)
before implementation; completed changes are archived under `openspec/changes/archive/` and must not
be edited. Current behaviour lives in `openspec/specs/`. Run `pnpm spec:validate` before claiming a
change is done. The procedure is `.agents/skills/openspec-workflow/SKILL.md`.

## Agent tooling

- Жизненный цикл серверов определяется разделом `Local preview` в `AGENTS.md`: не запускать
  отделённые фоновые серверы; перед итоговым отчётом завершать все серверы, запущенные агентом, и их
  процессы запуска, затем проверять освобождение портов. Это относится и к 5190; сохранить свой
  сервер можно только по явной просьбе пользователя. Пользовательский dev-стенд не трогать.
- `.claude/skills/react-frontend` — React 19 + Vite conventions here, and the vendored Vercel rule
  sets in `.agents/skills/` (`react-best-practices`, `composition-patterns`,
  `web-interface-guidelines`).
- `.claude/skills/codex-worker` — which agent gets which task (Codex CLI, the Codex plugin, local
  Qwen through opencode), how a delegated diff is isolated in a worktree, measured and accepted.
- `.claude/skills/codex-visual` — Codex as an independent UI/UX consultant and image generator.
- `.codex/agents/` — Codex's read-only `reviewer` and `spec_architect`.
- `.opencode/agents/` and `opencode.json` — opencode's agents and the Qwen providers (LM Studio on
  `192.168.1.227:1234`, and the remote endpoint).
- `.claude/hooks/context-budget.py`, registered in `.claude/settings.json` on `UserPromptSubmit` —
  once the last request ran with more than 250k tokens of context, it warns the user and asks Claude
  to checkpoint the subtask and propose a fresh session. It never blocks. The same script is
  installed globally (`~/.claude/hooks/`) and steps aside when the project has its own copy.

### How the global rules apply

`~/.claude/CLAUDE.md` carries the personal working rules. Where this project differs:

- **A task branches off `main` without asking, unlike the global default.** The user's standing
  instruction (2026-09-30): every task starts on a fresh branch off an up-to-date `main` (`feat/…`,
  `fix/…`, `chore/…`), a feature goes through an OpenSpec change on that branch, and the branch
  lands through a pull request once `pnpm check` and `pnpm spec:validate` pass. The standing
  permission covers exactly that: branching for the task at hand and pushing it. Merging into
  `main`, pushing to `main` directly, and switching onto someone else's branch still need the user's
  words. A delegated task runs in its own worktree on its own branch (the codex-worker procedure).
- **Browser checks are allowed but costly.** The built-in browser asks the user to approve every
  JavaScript call on this site; prefer tests and screenshots, and say when a behaviour could not be
  seen (a hidden pane pauses the animation frame).
- **Implementation can be delegated; acceptance cannot.** Every delegated diff gets a fresh review
  against the spec; green checks are not acceptance.
