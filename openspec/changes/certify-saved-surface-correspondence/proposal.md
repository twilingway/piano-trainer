# Сертификат соответствия сохранённой поверхности

## Why

Полный read-only capture literal631 подтвердил восстановление источника и нулевой эффект PAD/SIDE,
но actual triangulation отличается от frozen на 20 triangles внутри 10 quad. Нужен отдельный
проверяемый профиль соответствия вершин и quad, который сохраняет этот отказ exact-TRI и не
наследует физические доказательства другой triangulation.

## What Changes

- Добавляется профиль `CERTIFIED_VERTEX_QUAD_CORRESPONDENCE_ACTUAL_TRIANGULATION` для одного
  immutable literal631: typed provenance, base6890/rig, полное ordered quad correspondence, явный
  actual-quad → native-CC-quad bridge, ROW и диагностическое сравнение стадий.
- Actual и frozen triangle arrays/IDs/hashes хранятся отдельно. Исходные observations и прежний
  exact ordered TRI gate остаются неизменными.
- Полный сертификат даёт только именованный prerequisite для подготовки отдельного
  `DIAGNOSTIC_ROUNDTRIP_ONLY` writer. Его реализация, save/reopen и физическая приёмка сюда не
  входят.

## Goals / Non-Goals

**Цель:** установить происхождение и соответствие неизменённых vertex IDs/quad boundaries при явно
другой внутренней диагонали, без переиндексации геометрии.

**Вне области:** поиск поз и новые model/FK evaluations вне immutable cached readback, GPU/Blender,
запись сцен, коррекция поверхности, новая LEFT calibration/nails, перенос collision/BVH/cap proofs,
экспорт, игра и visual acceptance. Существующий NumPy FK/LBS readback уже закреплённых arrays внутри
frozen committed readers разрешён только для проверки исходных receipts; новая поза или модель не
вычисляются.

## Capabilities

### New Capabilities

- `saved-surface-correspondence`: отдельный локальный статический сертификат сохранённой vertex/quad
  геометрии и actual triangulation с ограниченной диагностической полномочностью.

### Modified Capabilities

Нет. Этот addendum не меняет `verified-pianist-runtime`, прежние exact-TRI гейты или игровое
поведение.

## Impact

Изменение касается только нового private offline certificate и его provenance-контракта. Реализация
и входные arrays остаются локальными; в git попадают спецификация и итоговый статус. Новых
production dependencies, лицензий, публикации private derivatives или материальных пользовательских
решений нет. Pure TypeScript core, интерфейс, fallback и время PracticeSession не меняются. Старые
pinned design/tasks/spec сохраняются побайтно.
