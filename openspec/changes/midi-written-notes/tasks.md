## 1. Ноты по стану

- [x] 1.1 `src/song/song.ts`: `secondsAt` — обратное к `quartersAt`. Проверка:
      `pnpm exec vitest run src/song/song.test.ts`
- [x] 1.2 `src/song/midiScore.ts`: `placeNotes` общий с `withWrittenScore`; `writtenNotes` — сетка,
      слияние дублей по ролям, аккорд до самой длинной, обрыв на следующем начале, секунды по темпу.
      Проверка: `pnpm exec vitest run src/song/midiScore.test.ts`; на реальных файлах падающие ноты
      совпадают с головками стана

## 2. Переключатель

- [x] 2.1 `PlayerPrefs.notesAsWritten`, `Song.asWritten`, `overridesKey` с `:written`, состояние в
      `useSong`, чекбокс «Ноты как на стане» во вкладке «Песня» только для MIDI, переводы. Проверка:
      `pnpm typecheck`, тест `SongSettings`
- [x] 2.2 `AGENTS.md`: договорённость о нотах MIDI дополнена

## 3. Готовность

- [x] 3.1 `pnpm check` и `pnpm spec:validate`
