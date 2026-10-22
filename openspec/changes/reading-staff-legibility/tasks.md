# Tasks

## 1. Спецификация

- [x] 1.1 Proposal, delta spec `course-staff`, design; `pnpm spec:validate`.

## 2. Показ стана в курсе

- [x] 2.1 Чистый `src/staff/courseStaff.ts` (`courseStaffXml`, `courseStaffZoom`, `courseCursor`) с
      unit-тестами: implicit-такт скрывает размер, полный такт нет; масштаб ограничен по высоте,
      ширине и [0.5, 3]; одна позиция скрывает курсор.
- [x] 2.2 `Staff`/`liveCursor`: флаг `course`, без подсветки, подбор масштаба, сдвиг или скрытие
      черты; песни без изменений. Проверка: `pnpm exec vitest run src/staff`.
- [x] 2.3 `Workspace`/`ConnectedPracticeWorkspace`/CSS: флаг курса и `.staff--course`. Проверка:
      `pnpm typecheck`, тесты `ConnectedPlayerRegions`.

## 3. Подписи двух рук

- [x] 3.1 Необязательная функция подписи в `twoHandPromptXml`, `useTwoHandCourse` передаёт
      `twoHandNoteName`; тест генератора на подпись и на прежний вывод по умолчанию.

## 4. Доставка

- [x] 4.1 Скриншоты курсов на 5190: P1 одна нота и фразы, две руки, удержание баса, ритм, два ритма
      — 1440×900, 360×640, 667×375; обычная песня без изменений.
- [x] 4.2 `pnpm check`, `pnpm spec:validate`; PR в dev.
