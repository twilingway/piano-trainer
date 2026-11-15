## Purpose

Подтвердить независимое сохранение и повторное открытие единственной диагностической позы пианиста в
приватной копии Blender, сохранив исходные сцены, атлас и границы физического допуска.

## ADDED Requirements

### Requirement: Отдельная диагностическая транзакция

Система SHALL сохранять диагностический sample только в новый private output, закрепляя исходный
.blend, producer, correspondence, executable и код по SHA. Исходный файл, accepted atlas, GUI и
прежние immutable receipts MUST сохраняться без изменений. Выходной файл MUST быть независимой
копией, не hardlink и не alias исходника.

#### Scenario: Изоляция записи

- **WHEN** подготовлен подтверждённый literal631 bundle и новый output directory
- **THEN** создаются exclusive reserve/work copy и новый saved .blend, а SHA исходника и reserve
  остаются прежними

#### Scenario: Неверный вход или существующий output

- **WHEN** SHA, scope, topology, producer или путь не соответствует закреплённому контракту либо
  output уже существует
- **THEN** запуск завершается отказом без изменения исходника и без готового proof

### Requirement: Сохранность кадров и точная сериализация

Система SHALL создавать новый sample после всех существующих action/key/marker frames, сохранять
полный исходный набор 64 поз и frozen C4/sentinels и проверять zero/restore guards вокруг нового
sample. Готовые pre-LBS6890 и source rotations52 MUST записываться без повторной оценки модели или
оптимизации. PAD и SIDE MUST оставаться exact no-op для данного sample; новая actual triangulation
MUST сохраняться, старые TRI proofs не наследуются.

#### Scenario: Новая диагностическая поза

- **WHEN** literal631 сериализован в новой диагностической сцене
- **THEN** source scene и прежние 64 позы/контроли дают те же geometry/rig/key hashes, а sample
  имеет закреплённые pre-LBS и pose matrices

#### Scenario: Изменение старого кадра или ненулевая коррекция

- **WHEN** проверка находит изменение прежнего кадра, неразрешённый datablock/fcurve edit или
  ненулевой PAD/SIDE
- **THEN** результат имеет FAILED, не получает admission и сохраняет диагностическую причину

### Requirement: Независимый saved readback

Система SHALL завершать writer process перед запуском второго background Blender process. Второй
процесс MUST читать сохранённый .blend и самостоятельно получать shape-only, post-LBS, preGN,
postPAD, postSIDE, полные 52 rig/rest/weights, 88 клавиш и RIGHT nail references. Сравнение
геометрии с producer допускает только заранее заданный diagnostic bound 1e-5 м; PAD/SIDE no-op и
старые frame guards остаются exact.

#### Scenario: Успешный roundtrip

- **WHEN** новый процесс повторно открыл saved .blend и все проверки прошли
- **THEN** публикуется DIAGNOSTIC_ROUNDTRIP_ONLY proof с SHA сохранённого файла, readback и обоих
  process receipts

#### Scenario: Partial readback

- **WHEN** процесс упал, missing asset, geometry mismatch или нарушена сохранность исходников
- **THEN** complete proof не публикуется, а partial output имеет FAILED без authority

### Requirement: Диагностический статус не заменяет физическую приёмку

Система MUST сохранять physical_class=null, calibration=null, eligible_for_write=false,
serialization_ready=false и отсутствие inherited physical proofs. RIGHT nails являются
reference-only; native LEFT nails, contact, bilateral/world, export, gameplay и visual acceptance
остаются отдельными открытыми гейтами. Private assets MUST отсутствовать в Git и production.

#### Scenario: Roundtrip PASS при незавершённых руках

- **WHEN** диагностический save/reopen прошёл
- **THEN** отчёт не объявляет руки готовыми, не обновляет accepted ledger и не подключает private
  asset к игре
