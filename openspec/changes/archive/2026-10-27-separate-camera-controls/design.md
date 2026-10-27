# Design

## Context

См. proposal.md. `worldFov` уже хранится отдельно (20–100°, default45), но standard выводит
legacy-дорогу из камеры клавиатуры. Standard+freeCamera использует общий inspection pass. В
game/free уже есть отдельные world/keyboard passes и near-blend, однако их маршрут рассчитан на
freeLanes/freeFar/roadFreeDepth, а legacy идёт по +Z.

## Goals / Non-Goals

Независимы владельцы настроек, raw view/projection мира, клавиатура и их сбросы. Согласованный
ближний участок намеренно зависит от физического контакта клавиатуры. Новые height/distance/pitch
sliders мира и новый формат сохранения ручной орбиты не вводятся: у мира FOV, композиция,
fixed-ракурс либо существующие orbit/WASD. Ручная поза остаётся runtime-состоянием FreeSceneCamera;
reload возвращает начальную позу по прежним правилам. Новых production dependencies нет.

## Decisions

1. `camera.*` остаётся владельцем keyboard-параметров, включая top/player/hands. Существующий
   `worldFov` — единственный сохранённый FOV мира. World reset=45° плюс resetPose выбранной
   композиции, без изменения composition, горизонта, клавиатуры или musical clock. Keyboard reset
   меняет только camera.*.

2. Во всех трёх композициях ThreeStage использует отдельные world/keyboard passes. Standard-free
   становится свободным миром с собственной клавиатурой вместо вращения всего инструмента одним
   inspection pass. Picking использует именно показанную keyboard camera. Постановка сохраняет
   прежний маршрут и приоритет; ручные элементы объясняют временную недоступность.

3. Мировые pose и bounds берутся из стабильной мировой геометрии, не из фактического keyboard fit.
   Изменение camera.* не вызывает world reset, auto-frame или пересчёт дальних контрольных точек.
   Миграция не удаляет настройки/историю и не переносит legacy horizon в мировые метры.

4. Вынести общий чистый адаптер route progress + physical contact для legacy и free-road. На
   progress≥0.25 применяется чистая world-проекция, у попадания — проекция физического контакта
   показанной клавиши. Между ними — существующий плавный near-blend. CPU, GLSL, labels, цифры, ореол
   и эффекты получают один контракт. Просто включить docked-флаг или передать worldFov в старый
   noteProjectionCamera недостаточно: его origin/pixels/depth пока зависят от keyboard camera.

Эффекты контакта используют физические якоря и проход клавиатуры; площадка, софиты и мировая
партитура — проход мира. Мировая привязка не означает, что контактный огонь должен получать
world-camera pass или мировой FOV.

5. Обычная композиция без свободного осмотра строит мировую камеру дороги от опорной клавиатуры:
   `CAMERA_PRESETS.top`, текущие окно, диапазон и размещение (lift/scale), без `camera.*` игрока.
   Экранный горизонт и ширина у горизонта отсчитываются от опорной линии и входят в набор мира.
   Контакт, горизонт и ширина полностью задают проекцию плоскости дороги, поэтому FOV мира здесь
   ничего не меняет: он действует только в перспективных мировых камерах (свободный осмотр, game,
   free). Решение пользователя 27.10.2026; вариант с FOV, сдвигающим камеру вдоль оси, проверен
   тестом и отброшен. Дефолтный вид совпадает с прежним, пока камера клавиатуры не изменена.

6. Ответственность: `noteLaneProjection.ts`, `roadScenePoints.ts` и новый/расширенный чистый адаптер
   считают проекции без React/таймеров. `viewSceneCamera.ts`, `RoadLayer.ts`,
   `nativeViewCameras.ts`, `noteProjectionCamera.ts` передают геометрию; `three/ThreeStage.ts`,
   `FreeSceneCamera.ts`, `roadFrameProjection.ts`, `dockedRoadProjection.ts`, `DockedRoadLabels.ts`,
   `sceneCameraPasses.ts` только согласуют отрисовку. PracticeSession остаётся единственным clock.
   UI CameraSettings/CameraCompositionSettings/KeyboardSettings получает чистые props/callbacks;
   RU/EN пишутся одновременно через t().

## Risks / Trade-offs

- Двойная контактная коррекция → один adapter и проверки CPU/GLSL на белых/чёрных.
- Незаметная связанность через bounds → проверка неизменности raw matrices и дальних точек при
  изменении всех camera.*; near-join проверяется отдельно.
- Legacy positive Z против free-road negative Z → нормализованный progress, тесты обоих маршрутов и
  99/100/101/150% горизонта из PR232.
- Отличающийся standard-free → явное изменение в спецификации; без второго пианино и экранных
  дубликатов огня. Не выдавать старый whole-scene inspection за две камеры.
- Лишние allocations/remount → кадр использует прежние ресурсы; review и реальные счётчики
  mount/load, не только средний FPS.
- Интеграция с PR225/229/232 → сохранить keyboard presets, привязку огня и расширенный горизонт;
  повторить совместную browser-приёмку после интеграции.

## Migration Plan

Сначала согласовать и проверить pure adapter, затем runtime/passes, потом UI. Сохранённые camera.*,
worldFov и mode keys переиспользуются; ручная орбита не мигрирует. До реализации ни один пункт не
считается готовым. Нужны independent review, pnpm check, pnpm spec:validate и видимая приёмка;
архивировать только после них.
