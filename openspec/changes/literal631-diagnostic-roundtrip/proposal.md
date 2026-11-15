# Диагностическое сохранение literal631

## Why

Сопоставление native vertex/quad уже доказано в private correspondence v2, но готовые pre-LBS данные
ещё не прошли независимое сохранение и повторное открытие Blender. Без этого нельзя переходить к
native LEFT semantic readback и дальнейшей анимации.

## What Changes

- Один bounded CPU-only roundtrip literal631 в новой приватной копии сцены, без поиска поз.
- Новая диагностическая сцена и reserved sample с готовыми pre-LBS6890 и source rotations52.
- Независимый background process открывает сохранённую копию и сверяет пять стадий, rig, клавиши и
  сохранность прежних кадров.
- Любой отказ оставляет диагностические артефакты и явный FAILED; исходная сцена и accepted atlas
  сохраняются.

## Capabilities

### New Capabilities

- `pianist-diagnostic-roundtrip`: ограниченный private save/reopen proof без physical admission.

### Modified Capabilities

Нет.

## Impact

В Git входят только OpenSpec и текстовый отчёт. Private Python tools, arrays и .blend остаются
ignored в worktree задачи. Production TypeScript, зависимости, лицензии и player UI не меняются.
Этот этап не вводит новых продуктовых решений: physical_class/calibration=null,
eligible_for_write=false и serialization_ready=false обязательны даже при PASS.
