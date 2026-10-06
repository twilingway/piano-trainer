## 1. Упрощение

- [x] 1.1 `src/song/arrangement.ts`: `simplifiedSong` — аккорды правой и левой руки, линия как есть,
      один голос, подъём мелодии, перенос внутрь 88 клавиш, свой стан. Проверка:
      `pnpm exec vitest run src/song/arrangement.test.ts`; прогон по реальным файлам — аккорды не
      больше 3 нот, охват не больше октавы

## 2. Выбор

- [x] 2.1 `Song.simplified`, `overridesKey` с версией; `simplified` в `useSong`, сброс с песней;
      «Аранжировка» во вкладке «Песня» только для MIDI; переводы. Проверка: `pnpm typecheck`, тест
      `SongSettings`

## 3. Готовность

- [x] 3.1 `pnpm check` и `pnpm spec:validate`
