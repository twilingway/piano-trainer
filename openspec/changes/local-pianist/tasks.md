## 1. Экспорт модели

- [x] 1.1 Копия `pianist-full.blend` и `export_pianist.py` в `pianist-full-008/export-glb/`.
      Проверка: sha256 копии равен исходнику; исходник не изменён после экспорта.
- [x] 1.2 Удаление лабораторных объектов и скрытых дублей тела, экспорт `pianist.glb`. Проверка:
      `export-report.json` (удалённые грани по материалам), рендеры `check/` спереди, сзади, в три
      четверти без дыр; в GLB нет изображений, кроме головы и туфель.

## 2. Подключение

- [ ] 2.1 `.gitignore` с `local-models/`, модель и авторство обуви в `local-models/`. Проверка:
      `git check-ignore local-models/pianist.glb`, `git status` чистый от личных файлов.
- [ ] 2.2 `pianistModel.ts`, `pianist.ts`: поиск в dev, загрузка, посадка, поза по времени песни.
      Проверка: `pnpm exec vitest run src/render/three/pianist.test.ts`.
- [ ] 2.3 Настройка `pianist`, переключатель «Мой пианист (проба)», цепочка до `ThreeStage`.
      Проверка: тесты настроек и `KeyboardSettings`, `pnpm typecheck`.

## 3. Проверка

- [ ] 3.1 Стенд задачи на 5192: пианист в «3D» на компьютере и узком телефоне, скриншоты.
- [ ] 3.2 `pnpm check`, `pnpm spec:validate`.
- [ ] 3.3 `pnpm build` при лежащей модели: в `dist/` нет GLB и текстур пианиста.
