# Tasks

## 1. Песня в MIDI

- [x] 1.1 `songToMidi(song)` в `src/song/songMidi.ts`: карта темпа из `song.beats`, размер такта из
      `song.measures`, дорожки по рукам без пустых; проверка —
      `pnpm exec vitest run src/song/songMidi.test.ts` (обратное чтение через `new Midi(bytes)`:
      высоты, тики начал по долям, длительности, один темп у гимна, две дорожки, одна дорожка для
      одной руки)

## 2. Файл урока

- [x] 2.1 Экспортировать `loadOverrides` из `src/app/useSong.ts` и добавить
      `lessonExportFile(choice, format)` в `src/app/lessonExport.ts`; проверка —
      `pnpm exec vitest run src/app/lessonExport.test.ts` (имя файла с заменой запрещённых символов;
      MusicXML с `<fingering>` у каждой ноты и правкой из localStorage; MIDI читается и совпадает по
      числу нот с `lessonSong`)

## 3. Кнопки в библиотеке

- [x] 3.1 `LibraryDialog`: чипы «MusicXML» и «MIDI» у каждого уровня урока, проп `onExportLesson`;
      скачивание через Blob в `App.tsx`; стили чипов; проверка — `pnpm typecheck` и `pnpm lint`,
      визуально — игрок
- [x] 3.2 Полный гейт: `pnpm check` и `pnpm spec:validate`
