## 1. Ядро

- [x] 1.1 `ownsNote` с `parts`; `PracticeOptions.parts`, `PracticeOptions.accompaniment`,
      `session.accompanies`; `autoNotes` и `sessionAudio` через `accompanies`. Проверка:
      `pnpm exec vitest run src/practice/sessionParts.test.ts` — партия баса ждёт только бас,
      аккорды той же руки играет программа; выключенный аккомпанемент молчит; прослушивание играет
      всё
- [x] 1.2 `Take.parts`, запись в `Trainer`, фильтр в `compareTake`. Проверка: тест в
      `src/recording/compare.test.ts` — разбор партии не требует других партий

## 2. Выбор

- [x] 2.1 `choosableRoles`; выбор партии в `useTrainer`, привязанный к `song.parts`; Ranked и
      словесный режим без партий; `accompaniment` в `playerPrefs`. Проверка: `pnpm typecheck`
- [x] 2.2 `PartsChoice`, `PartOptions`, группа «Партии» в верхней панели, меню телефона и разделе
      «Игра»; переключатель «Автоаккомпанемент»; переводы. Проверка:
      `pnpm exec vitest run src/ui/settings/PlaySettings.test.tsx`

## 3. Готовность

- [x] 3.1 `pnpm check` и `pnpm spec:validate`
