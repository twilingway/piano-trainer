# Tasks

## 1. Файл голоса уровня

- [x] 1.1 Glob `*.voice.{mp3,ogg,wav}`, `ExerciseLevel.voice`, `Song.voice` через `lessonSong()`;
      тесты привязки, приоритета форматов и отсутствия голоса после транспозиции:
      `pnpm exec vitest run src/song/localLessons.test.ts src/app/lessons.test.ts`.

## 2. Воспроизведение

- [x] 2.1 `voiceTrack.ts` на `Tone.Player` и предзагрузка в `Trainer.load()`; typecheck.
- [x] 2.2 Планирование голоса в `SessionAudio`: старт с нуля и с середины, остановка на reset и на
      конце диапазона, молчание в режиме ожидания и на скорости не 1:
      `pnpm exec vitest run src/audio/sessionAudio.test.ts`.

## 3. Проверка

- [x] 3.1 `pnpm check` и `pnpm spec:validate`.
