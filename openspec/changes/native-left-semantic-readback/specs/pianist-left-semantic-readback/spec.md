## Purpose

Проверить происхождение, реальную интерполяцию и повторное чтение native LEFT скалярных полей в
отдельной сохранённой копии Blender, сохранив старые данные и отсутствие физического допуска.

## ADDED Requirements

### Requirement: Принятый вход и родные поля LEFT

Диагностический процесс SHALL принимать только independently committed/reviewed saved roundtrip с
точными SHA. Он SHALL добавлять ровно 11 заранее объявленных native LEFT POINT/FLOAT полей: кисть,
пять pads и пять finger weights из закреплённых полных источников без RIGHT reflection, pruning,
renormalization или подмены источника округлёнными Blender groups.

Имена SHALL быть `native_left_hand_mask`, `native_left_pad_1`, `native_left_pad_2`,
`native_left_pad_3`, `native_left_pad_4`, `native_left_pad_5`, `native_left_finger_1`,
`native_left_finger_2`, `native_left_finger_3`, `native_left_finger_4`, `native_left_finger_5`.
Любая коллизия SHALL отклоняться; whitelist не даёт права менять прежнее поле. Процесс SHALL менять
только существующий mapped diagnostic skin mesh в новой byte-copy, без новых scenes, objects, poses,
curves или keyframes.

#### Scenario: Неполный предыдущий запуск

- **WHEN** receipt предыдущего roundtrip partial, FAILED, отсутствует или не совпал SHA
- **THEN** новый writer не запускается, результат явно BLOCKED без изменения source

#### Scenario: Неправильная цепочка или отражение

- **WHEN** finger field получен другой цепочкой, из RIGHT, top4 или повторно округлённых weights
- **THEN** независимое сравнение raw typed values отклоняет результат до сохранения

### Requirement: Actual поля и независимое повторное открытие

Процесс SHALL измерять actual evaluated LEFT поля и сохранять их native correspondence. Шесть
reference-полей SHALL совпадать с отдельно закреплённым actual FLOAT-by-ROW source; новые пять
finger fields SHALL иметь собственные captures. Отдельный fresh процесс SHALL открыть именно
сохранённые bytes и сравнить все 11 typed payloads, их shape/dtype/name/domain/count.

Нормативное направление ROW SHALL быть `r[e]=actual evaluated ID→ROW`,
`expected_actual[e,k]=reference_by_ROW[r[e],k]`, обратное — scatter
`observed_by_ROW[r,:]=observed_actual`. Raw finger SHALL быть упорядоченной суммой трёх Float64
значений с одним F32-приведением; evaluated поля SHALL оставаться непрерывными Float32.

#### Scenario: Подмена порядка строк

- **WHEN** поля переставлены неверным ROW mapping или positional stencil заменил FLOAT interpolation
- **THEN** сравнение отклоняет результат; совпадение позиции само по себе не даёт PASS

#### Scenario: Сохранённые значения изменились

- **WHEN** fresh reopened field имеет другой payload, dtype, domain, размер или отсутствует
- **THEN** общий proof остаётся FAILED без complete COMMITTED receipt

### Requirement: Полная сохранность прежней сцены

Добавление SHALL сохранять source, старые атрибуты, geometry/topology/matrices, rig/rest/weights,
materials/curves, 64 принятые позы и union124 guards. Пять стадий SHALL сниматься на N1672 и
guards1671/1673; original source SHALL сравниваться без normalization, target active attribute SHALL
сохранять identity по имени. Сдвиг индекса attribute slots SHALL нормализоваться только точным
соответствием named metadata; допустимы только 11 declared additions.

#### Scenario: Новое поле сдвинуло индекс старого

- **WHEN** Blender изменил array-slot index прежнего named attribute
- **THEN** проверяется прежний typed payload после однозначного восстановления identity; изменение
  данных, duplicate/missing/unknown field или выход за whitelist отклоняется

#### Scenario: Изменилась геометрия в старом кадре

- **WHEN** хотя бы один actual guard или прежний geometry/rig/key field отличается от baseline
- **THEN** result FAILED; source и accepted atlas не перезаписываются

### Requirement: Диагностические границы и остановка

Даже при PASS процесс SHALL сохранять scope NATIVE_LEFT_SEMANTIC_READBACK_ONLY,
physical_class/calibration null, eligible_for_write/serialization_ready false. Он SHALL
останавливать только owned job при первом deadline/remaining event, memory/timeout или stale quota.
Ногти, arm baseline, контакт, анимация, экспорт и игровой допуск SHALL оставаться отдельными.

#### Scenario: Успешный semantic readback

- **WHEN** writer/reopen и все typed guards прошли
- **THEN** отчёт подтверждает только semantic readback, без физического допуска и изменения runtime

#### Scenario: Лимит или просроченные данные

- **WHEN** remaining любого предоставленного account window <=30%, наступило 19:59 UTC 15.11.2026,
  либо данные лимита старше 90 секунд
- **THEN** owned run завершается, сохраняется честный partial receipt; после первого
  threshold/deadline остаются только упаковка и cleanup, чужие процессы сохраняются
