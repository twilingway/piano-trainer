---
name: codex-visual
description:
  Codex CLI as an independent visual consultant for Piano Trainer — a UI/UX concept before a
  substantial interface change, an audit of real screenshots after it, a comparison with a reference
  (Synthesia, EveryonePiano, a sticker photo), and raster image generation or editing. Use before
  and after substantial UI work, when a new raster asset is needed, or when the user asks to consult
  Codex.
---

# Codex as a visual consultant

Carried over from towerdefander (adopted there on 2026-09-13). Claude Code is the executor and makes
the final decisions. Codex is an independent consultant for UI/UX analysis, checking the real layout
from screenshots, comparing with a reference, generating and editing raster images, and finding
visual defects after implementation.

Codex's recommendations are never applied automatically. Claude checks each one against the active
OpenSpec change, `AGENTS.md` and the existing style, then tells the user what was taken, what was
rejected, and why.

## Availability

Before the first call in a session:

```bash
codex login status
codex exec -C . --ephemeral --sandbox read-only 'Ответь только: CODEX_CLI_OK'
```

If Codex is unavailable, continue alone and tell the user that the extra check did not happen.

## Rules

- **Sandbox.** Consultations and audits run with `--sandbox read-only`; image generation and editing
  with `--sandbox workspace-write`. The elevated Windows sandbox is broken on this machine — see the
  `codex-worker` skill for the `unelevated` setting and the `%TEMP%` limitation.
- **No code edits** during a consultation or an audit.
- **Scores and samples.** `local-lessons/` holds scores that may not be published; Codex may read
  them for context but never copies their music into generated files.
- **Where generated files go:** `public/generated/<name>.png`, a git-ignored scratch area that is
  never committed. Claude looks at every generated file (Read) before using it. An asset the app
  uses moves into the module that imports it (for example `src/render/keys/`) and is committed there
  only after the user confirms, because the repository is public.
- **When to call.** Substantial visual decisions and the final check, not every small edit.
- **Running a call.** Calls take minutes: run them in the background, save the answer with
  `-o <scratchpad>/codex-<topic>.md`, summarise it for the user with the token count from the end of
  the log.
- **Cost.** Consultations and audits pass `-c 'model_reasoning_effort="medium"'`; `high` only for
  the final audit of a finished UI task. Images scaled down to at most 1024 px on the long side,
  files named in a list, one topic per call.

## Screenshots in this loop

The built-in browser pane asks the user to approve every JavaScript call on this site, and a hidden
pane pauses the animation frame. Take screenshots with the pane visible and without scripts where
possible; say when a moving part (falling notes, scrolling staff) could not be captured. Save them
in the scratchpad, not in the repository.

## Command templates

### Interface design

```bash
codex exec -C . --ephemeral --sandbox read-only -c 'model_reasoning_effort="medium"' -o <scratchpad>/codex-design.md '
Изучи требования задачи (openspec/changes/<change>/) и существующую реализацию (src/App.tsx, src/styles.css и названные файлы).
Выступи как независимый UI/UX-консультант для тренажёра игры на пианино.
Не изменяй файлы.

Предложи:
1. композицию экрана;
2. визуальную иерархию;
3. состояния элементов;
4. поведение на разных размерах экрана;
5. возможные проблемы доступности и управления (мышь, клавиатура компьютера, MIDI-пианино);
6. конкретные рекомендации для реализации.

Claude Code примет окончательное решение.
'
```

### Checking the real layout

```bash
codex exec -C . --ephemeral --sandbox read-only -c 'model_reasoning_effort="medium"' -o <scratchpad>/codex-audit.md '
Проанализируй приложенный скриншот реального интерфейса.
Не изменяй файлы.

Проверь композицию, иерархию, отступы и выравнивание, размеры элементов, типографику,
контраст и читаемость (нот, названий нот, цифр пальцев, наклеек на клавишах),
состояния элементов управления, переполнение и обрезку.

Раздели замечания на Critical, Important, Optional; для каждого укажи проблему и исправление.
Финальное решение принимает Claude Code.
' -i <scratchpad>/ui-current.png
```

Pass the prompt before `-i`: the image flag takes several files, and a prompt placed after it can be
read as one more file name.

### Comparison with a reference

```bash
codex exec -C . --ephemeral --sandbox read-only -c 'model_reasoning_effort="medium"' -o <scratchpad>/codex-compare.md '
Изображение 1 — текущая реализация. Изображение 2 — визуальный референс.
Сравни композицию, пропорции, цвета, типографику, отступы и иерархию.
Перечисли существенные расхождения. Не требуй слепого копирования. Не изменяй файлы.
' -i <scratchpad>/ui-current.png -i <reference.png>
```

### Generating or editing an image

```bash
codex exec -C . --ephemeral --sandbox workspace-write -o <scratchpad>/codex-imagegen.md '
$imagegen Создай оригинальный визуальный ассет для тренажёра игры на пианино.
Назначение: [...]. Содержание: [...]. Композиция: [...]. Размер и формат: [...]. Фон: [...].
Без логотипов, водяных знаков и лишнего текста.
Сохрани результат строго в public/generated/[имя].png. Не изменяй код и другие файлы.
'
```

## The visual loop for a substantial UI task

1. Claude studies the requirements and the code; Codex proposes an independent concept.
2. Claude decides and implements.
3. Claude takes screenshots; Codex audits them; Claude fixes the confirmed problems.
4. Claude runs `pnpm check` and reports.
