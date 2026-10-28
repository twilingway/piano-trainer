## 1. Удаление слоя и параметров

- [x] 1.1 Удалить модули художественной проекции, её настройки, строки локализации и их тесты
- [x] 1.2 Убрать `noteProjection` из настроек стана, хуков настроек, `useFallingView`,
      `FallingNotesView`, `ViewNoteSettings`, `RoadLayer`, `ThreeRoadFrame`; проверка — typecheck
- [x] 1.3 Свернуть ветки слоя в `ThreeStage`, `ThreeKeysHost`, `DockedRoadLabels` к поведению без
      слоя; проверка — тесты дороги и подписей
- [x] 1.4 Убрать «Систему проекции» из `KeyboardSettings`, `HelpSettings`, `settingsTargets`
- [x] 1.5 Тест: сохранённые настройки стана с полем `noteProjection` читаются без него, остальные
      поля сохраняются

## 2. Проверка

- [x] 2.1 `pnpm check` и `pnpm spec:validate`
- [x] 2.2 Grep: в `src` нет `stylizedProjection`, `StylizedProjection`, `ProjectionParameters`,
      «Художественная проекция»
- [x] 2.3 Браузер на стенде задачи: «Прямо» и «В перспективе», ноты, подписи, эффекты, настройки
      «Падающие ноты» без «Системы проекции»
