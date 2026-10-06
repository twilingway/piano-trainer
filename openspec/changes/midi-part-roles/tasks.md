## 1. Роли

- [x] 1.1 `src/song/midiParts.ts`: `trackRoles`, `songParts` (названия, нумерация повторов,
      порядок); тесты на аранжировку в одном регистре, фортепианный MIDI с аккордами и без, второй
      голос, два аккомпанемента. Проверка: `pnpm exec vitest run src/song/midiParts.test.ts`

## 2. Чтение MIDI

- [x] 2.1 `Song.parts`, `SongNote.part`; `songFromMidi` считает статистику дорожек, назначает роли,
      руки и партии; одна дорожка — без партий. Проверка: тест в `src/song/midi.test.ts` на MIDI,
      собранном `@tonejs/midi`: мелодия ниже аккордов уходит в правую руку; одна дорожка делится по
      до первой октавы
- [x] 2.2 Транспонирование MIDI-песни сохраняет `part`. Проверка: тест `transposeSong` или чтение
      кода (spread сохраняет поле) и `pnpm typecheck`

## 3. Готовность

- [x] 3.1 `pnpm check` и `pnpm spec:validate`
