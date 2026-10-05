# Tasks

## 1. Сведения о сборке

- [x] 1.1 Передать `GIT_PR` из `deploy-production.sh` через compose в `Dockerfile`; проверить
      извлечение номера из темы merge-коммита и пустое значение для прямого коммита.
- [x] 1.2 Подставить `__BUILD_INFO__` в `vite.config.ts`, типизировать в `app/buildInfo.ts`;
      проверить `pnpm typecheck` и `pnpm build` с `GIT_SHA`/`GIT_PR` и без них.

## 2. Раздел «О программе»

- [x] 2.1 Добавить `AboutSettings` последним разделом настроек; проверить тестами
      `pnpm exec vitest run src/ui/settings` порядок разделов, ссылки PR/SHA и локальную сборку.
- [x] 2.2 Проверить раздел на localhost:5190 на компьютере и ширине 320 пикселей.

## 3. Проверка

- [x] 3.1 Провести независимое ревью, выполнить `pnpm check` и `pnpm spec:validate`.
