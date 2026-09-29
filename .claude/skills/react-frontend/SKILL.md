---
name: react-frontend
description:
  React 19 + Vite conventions for Piano Trainer, plus the Vercel React rule sets vendored in this
  repo. Use when building or reviewing UI — the app shell, toolbars, the side rail, the review bar,
  the React wrappers around the Pixi view and the OSMD staff, input handling, styling, or tests.
---

# React Frontend

One React 19 + Vite 8 app, strict TypeScript with `exactOptionalPropertyTypes` and
`noUncheckedIndexedAccess`, `consistent-type-imports`, plain CSS in `src/styles.css`.

## Boundaries that are not style preferences

- **React never draws the falling notes, the keyboard or the staff.** The Pixi view
  (`src/render/FallingNotesView.ts`) and the trainer (`src/practice/Trainer.ts`) are created once
  and live outside React; React sends them commands and reads throttled snapshots. The staff is OSMD
  inside `src/staff/Staff.tsx`, which talks to OSMD imperatively through refs.
- **Nothing re-renders React per animation frame.** Per-frame work (song time, scrolling the single
  staff line, drawing) runs in the trainer's ticker or a component's own `requestAnimationFrame`
  loop and reads what it needs through refs or a stable callback (`liveBeat`).
- **Behaviour lives in pure modules** — fingering, song model and MusicXML passes, the practice
  session, recording — each with Vitest tests. A component that computes musical facts is a smell.
- **Staff features are MusicXML passes**, `string -> string`, composed in a `useMemo` before OSMD
  renders; OSMD's own model is read only for layout (lines, noteheads, the cursor).
- **Hidden is not unmounted** for the Pixi host: it carries the keys, the sound and the take.
- Player-facing strings are Russian; identifiers and comments are English.

## Component conventions

- Effects: mount-once with a `disposed` flag and real cleanup (Pixi app, OSMD, listeners, MIDI).
- Functions an effect calls but must not re-subscribe on: `useEffectEvent`. State that resets when a
  song changes: set during render keyed on the song key, not in an effect (the React lint rule
  forbids the latter).
- Preferences the user sets (zoom, lines, names, which views show) persist in `localStorage` through
  one prefs object; per-song data (finger corrections, takes) is keyed by song and key.

## Tests

- Pure modules get Vitest tests next to them; MusicXML tests run under
  `// @vitest-environment happy-dom` for `DOMParser`.
- A test must fail if the behaviour were wrong: pin canonical fingerings, exact beats and pitches,
  round-trip MusicXML through the reader.

## Rule sets

`.agents/skills/react-best-practices/` (Vercel's performance guide: grep `rules/` for the area you
touch; its RSC/server-action rules do not apply), `.agents/skills/composition-patterns/` (component
API shape) and `.agents/skills/web-interface-guidelines/AGENTS.md` (keyboard, focus, touch targets,
forms, accessibility). All three are vendored and kept out of Prettier and ESLint.
