## 1. Запись партитуры

- [x] 1.1 `src/song/scoreWriter.ts` из `transcribe.ts`: бемоли, смена размера, экранирование,
      `heads`; `transcribeTake` поверх него. Проверка:
      `pnpm exec vitest run src/recording/transcribe.test.ts` без изменений тестов

## 2. Партитура MIDI

- [x] 2.1 `src/song/midiScore.ts`: округление, закрытие зазора, `sourceIndex`, `signatureFifths`.
      Проверка: `pnpm exec vitest run src/song/midiScore.test.ts` — головки и нотоносцы, легато и
      стаккато (тест падает без закрытия зазора), бемоли, пальцы на нужной головке
- [x] 2.2 `songFromMidi` пишет партитуру с ключом файла или по тональности нот. Проверка: тесты
      `songFromMidi` в `midiScore.test.ts`; прогон по реальным файлам — все ноты связаны, XML
      разбирается
- [x] 2.3 `transposeSong`: MIDI-песня сдвигает ноты и стан без перечитывания. Проверка:
      `pnpm typecheck`, чтение кода

## 3. Соглашение и готовность

- [x] 3.1 `AGENTS.md`, `openspec/config.yaml`
- [x] 3.2 `pnpm check` и `pnpm spec:validate`
