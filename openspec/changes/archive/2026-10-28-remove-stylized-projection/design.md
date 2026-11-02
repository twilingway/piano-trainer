## Context

Художественная проекция живёт отдельным слоем `StylizedProjectionLayer` поверх обычной дороги
`ThreeStage`: свой фон, пакет нот, подписи, отладка и якоря клавиш. Её параметры
(`ProjectionParameters`) хранятся в настройках стана как `noteProjection` и проходят цепочку
staffPreferences → настройки → useFallingView → FallingNotesView → ViewNoteSettings → RoadLayer →
ThreeRoadFrame. Обычная дорога читает из них только `mode`, чтобы уступить кадр слою, и
`geometryOnly`, чтобы погасить эффекты.

## Goals / Non-Goals

**Goals:** удалить слой, параметры, настройки, строки и справку; оставить поведение обычной проекции
побайтно тем же для всех путей, где `mode` был прежним.

**Non-Goals:** переименовывать общие модули (`ProjectionDigits`, `ProjectionNumberInput`,
`noteProjectionCamera`, `RoadProjectionSettings`), атрибут `noteProjection` шейдеров нот или
`projectRoadLanePoint`: они относятся к обычной проекции и только совпадают по имени.

## Decisions

- Цепочка `noteProjection` удаляется целиком, без заглушки «всегда legacy»: нет второго значения —
  нет параметра. `ViewNoteSettings` остаётся только для стиля нот.
- Ветки `ThreeStage`, завязанные на слой (`projection?.drawBackground`, `projection?.requested`,
  `projection?.draw`, `projectionGeometryOnly`), сворачиваются к значению, которое они имели при
  выключенном слое: фона нет, отдельный проход нужен только для выпрямления дороги и эффектов
  дороги, эффекты не гасятся. `ThreeKeysHost` теряет условие `geometryOnly`.
- `DockedRoadLabels` рисует подписи всегда, когда включено выпрямление: проверка режима была
  единственным исключением.
- Сохранённое поле `noteProjection` просто не читается нормализатором настроек стана; при следующей
  записи оно исчезает. Отдельная миграция и версия схемы не нужны.

## Risks / Trade-offs

- [Свёртка условий в `ThreeStage` меняет кадр обычной проекции] → каждое условие заменяется его
  значением при `projection === undefined`; полный `pnpm check` и просмотр стандартной дороги в
  браузере.
- [Тесты обычной дороги опираются на параметры проекции как на фикстуру] → фикстуры теряют поле,
  проверки поведения остаются.
