# Задачи

## 1. Курс в Trainer

- [x] 1.1 Ввести `TrainerCourse` и пять адаптеров рядом с политиками; проверить `pnpm typecheck`.
- [x] 1.2 Перевести Trainer, рисование сцены и снимок на один курс, свести `trainerScopedInput` к
      общему маршруту ввода pair и держаного баса; проверить Trainer-тесты всех курсов
      (`pnpm exec vitest run src/practice`).
- [x] 1.3 Заменить `configure*` на `configureCourse` в хуках и тестах; проверить `pnpm test`.

## 2. Проверенные onset-группы

- [x] 2.1 Перенести форму держаного баса из `VerifiedWaitingOnsets` в модуль держаного баса;
      проверить `session.heldBass` и тесты держаного баса.

## 3. Интеграция

- [x] 3.1 Независимое ревью диффа и устранение замечаний.
- [x] 3.2 `pnpm check` и `pnpm spec:validate` зелёные; число тестов не меньше базовых 2153.
