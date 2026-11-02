# Соответствие сохранённой поверхности

## Purpose

Выделяет локальный статический сертификат соответствия vertex IDs и ordered quad boundaries при иной
actual triangulation. Его ограниченная диагностическая полномочность не подменяет exact-TRI,
физический допуск или независимый saved-copy proof.

## ADDED Requirements

### Requirement: Отдельный профиль и неизменное происхождение

Сертификат SHALL иметь профиль `CERTIFIED_VERTEX_QUAD_CORRESPONDENCE_ACTUAL_TRIANGULATION`,
закреплённые committed observations/child/producer receipts и полные typed source hashes. Исходные
receipts, arrays и прежний exact ordered TRI gate SHALL NOT изменяться или получать ретроактивный
PASS. Область первого профиля SHALL ограничиваться одним literal631 без поиска поз.

#### Scenario: Ранее наблюдавшаяся другая triangulation

- **WHEN** observations содержат отказ ordered source triangles, но кандидат проверяется новым
  correspondence-профилем
- **THEN** старый отказ и исходное `serialization_ready=false` сохраняются в исходном receipt
- **AND** новый сертификат сообщает отдельный результат с собственной provenance и областью

#### Scenario: Вход отсутствует или изменён

- **WHEN** receipt/asset отсутствует, повреждён или имеет иной SHA либо scope
- **THEN** сертификат отклоняется с точным source-failure code и не получает диагностический
  prerequisite
- **AND** интерфейс, выбранные руки, fallback и время игры не меняются

### Requirement: Раздельная typed identity и равенство значений

Для каждого массива сертификат SHALL сохранять фактические dtype, shape, ordered values и byte hash.
Равные целочисленные значения при разных dtype SHALL сообщаться отдельно от typed identity.
Validation conversion SHALL NOT менять сохранённый массив, его vertex IDs или его hash.

#### Scenario: Int32 и UInt32 содержат одинаковые base faces

- **WHEN** actual и producer faces имеют одинаковые ordered values при разных integer dtype
- **THEN** отчёт сообщает `values_equal=true` и `typed_equal=false`, сохраняя оба исходных hash
- **AND** различие типов не выдаётся за byte identity

### Requirement: Подтверждённая основа vertex IDs и рига

ROW correspondence SHALL выпускаться только после полного соответствия ordered base6890 vertex
IDs/faces, всех per-vertex weights, имён/parents/rest52 и source rig generation. Actual Basis SHALL
сохранять собственную identity; равенство Basis bare model template SHALL NOT предполагаться. Active
pre-LBS positions SHALL сравниваться с полными producer posed positions.

Captured `rest_head` и translation-часть `rest_matrix` SHALL сохранять самостоятельные typed
identity без требования byte equality, snap или усреднения. Система SHALL проверять три
max-absolute-component positional ошибки: `rest_head_to_producer_m`,
`rest_matrix_translation_to_producer_m` и `rest_matrix_translation_to_rest_head_m`; каждая SHALL
быть не больше существующего diagnostic position bound `1e-5m`. Producer reference SHALL
использоваться в той же rest-local системе без body translation. Rotation/affine/dimensionless,
source-hash и physical гейты SHALL оставаться неизменными.

#### Scenario: Самостоятельные Float32 rest-позиции

- **WHEN** два captured rest-поля численно различаются из-за независимого Float32 представления, но
  все три positional ошибки не превышают `1e-5m` и остальные rig/source гейты пройдены
- **THEN** проверка может продолжаться с измеренными тремя ошибками и двумя исходными typed hashes
- **AND** поля не заменяются друг другом и не выдаются за byte-identical

#### Scenario: Нарушено отдельное rest-сравнение или identity

- **WHEN** любое из трёх positional сравнений превышает `1e-5m`, source hash нарушен либо прежний
  rotation/affine rig gate не пройден
- **THEN** сертификат отклоняется независимо от успешности остальных positional сравнений
- **AND** v1 snapshots/plans/failed receipts не переписываются исправленной проверкой

#### Scenario: Basis отличается от template

- **WHEN** actual Basis не равен bare template, но его provenance, ordered topology, полные weights,
  rest и active pre-LBS stages подтверждены
- **THEN** различие Basis явно сохраняется без обратного восстановления PSD или подмены arrays

#### Scenario: Та же форма с другими индексами или весами

- **WHEN** vertex permutation, прунинг weights, другой parent/rest либо неподтверждённая source
  generation нарушают binding
- **THEN** ROW certificate и диагностический prerequisite не выдаются

### Requirement: Полное ordered oriented quad correspondence

Все actual polygon IDs, ordered loops и triangle-to-polygon bindings SHALL сохраняться. Для каждого
quad его actual triangles и frozen triangle-pair SHALL иметь одну и ту же oriented четырёхвершинную
boundary при том же quad ID. Внутренняя диагональ SHALL быть явно описана. Поиск похожей face,
сортировка vertex IDs, перестановка faces или изменение winding SHALL NOT подменять эту проверку.

#### Scenario: Другая внутренняя диагональ

- **WHEN** actual pair меняет диагональ внутри того же quad с теми же oriented boundary и vertex IDs
- **THEN** сертификат может подтвердить vertex/quad correspondence
- **AND** actual и frozen triangles/IDs/hashes сохраняются отдельно, exact-triangle identity
  остаётся непройденной

#### Scenario: Изменена граница или порядок quad

- **WHEN** pair выходит за свой quad, повторяет vertex, меняет winding, quad order или имеет
  неполное покрытие
- **THEN** correspondence отклоняется с указанием offending polygon/triangle IDs

### Requirement: Явный bridge к native Catmull-Clark

Полный typed bridge SHALL связывать каждый actual quad ID с native CC quad ID и cyclic start по
source ROW. Он SHALL быть однозначным и покрывать все quad/vertex IDs. Различный native face order
SHALL оставаться видимым; bridge SHALL NOT применяться как перестановка actual geometry arrays.

#### Scenario: Native CC faces имеют другой порядок

- **WHEN** native CC topology и actual topology совпадают через полный oriented bridge, но их face
  arrays имеют разный порядок
- **THEN** отчёт сохраняет bridge и оба порядка, не объявляя ordered native face identity

#### Scenario: ROW или bridge повреждён

- **WHEN** ROW содержит неверное соответствие либо bridge имеет duplicate, ambiguous cycle, reversed
  cycle или missing coverage
- **THEN** сертификат отклоняется без nearest-position или nearest-face fallback

### Requirement: Полная статическая проверка стадий

Сертификат SHALL сравнивать pre-LBS/LBS/preGN positions и доступные52posed world-joint heads с
producer в явно объявленном diagnostic FP32 tolerance `1e-5m`, сохраняя измеренные ошибки. PAD/SIDE
no-op SHALL подтверждаться полными actual stage arrays. Этот tolerance SHALL NOT менять physical
calibration или collision thresholds.

#### Scenario: Стадии численно совпали

- **WHEN** все bindings, сравнения стадий и полные actual PAD/SIDE no-op подтверждены
- **THEN** отчёт содержит coverage, измеренные ошибки и диагностический статус без physical PASS

#### Scenario: Коррекция или расхождение не подтверждены

- **WHEN** любой stage выходит за diagnostic tolerance либо PAD/SIDE не является подтверждённым
  no-op
- **THEN** prerequisite для diagnostic roundtrip не выдаётся, причина и actual delta сохраняются

### Requirement: Actual triangulation остаётся самостоятельной authority

Actual triangle arrays SHALL оставаться геометрическим источником последующих actual-surface
проверок. Общий quad SHALL NOT доказывать равенство piecewise-linear поверхностей разных диагоналей.
Collision/BVH/cap/barycentric/nail proofs, привязанные к frozen triangles, SHALL NOT наследоваться.

#### Scenario: Старый physical receipt использует другую диагональ

- **WHEN** доступен старый triangle-based proof для frozen triangulation
- **THEN** новый certificate не переносит его статусы или triangle-local coordinates
- **AND** последующая физическая проверка требует собственного actual-triangulation evidence

### Requirement: Mask coverage зависит от подтверждённого ROW

Заявление о принадлежности изменённых quad к проверяемым hand subsets SHALL использовать
подтверждённый ROW и явно названные actual/source mask namespaces. RIGHT masks или грубый LEFT arm
mask SHALL NOT выдаваться за native LEFT finger/pad semantics. Такая статистика SHALL NOT
классифицировать анатомическую область или физическую допустимость.

#### Scenario: RIGHT mask равен нулю

- **WHEN** flipped-quad vertices имеют нулевой RIGHT hand mask
- **THEN** отчёт не делает вывода о native LEFT без её отдельного POINT-FLOAT-by-ROW coverage
- **AND** даже подтверждённая нулевая membership не переносит full-surface physical proof

### Requirement: Ограниченный prerequisite диагностической копии

Только полный успешно опубликованный certificate SHALL выдавать именованный
`diagnostic_roundtrip_prerequisites_pass` для подготовки отдельного `DIAGNOSTIC_ROUNDTRIP_ONLY`
writer. Сам certificate SHALL оставаться read-only CPU/static операцией: без Blender/GPU, новых
model/FK evaluations вне immutable cached readback, source/GUI writes, изменения accepted ledger или
private публикации. Существующий NumPy FK/LBS readback immutable cached arrays внутри обязательных
frozen committed readers SHALL использоваться для проверки исходных receipts; ослабленный envelope
reader SHALL NOT заменять эти readers. `physical_class`/`calibration` SHALL оставаться null,
`eligible_for_write=false`.

#### Scenario: Проверка закреплённого cached literal

- **WHEN** обязательный frozen committed reader выполняет существующий NumPy FK/LBS readback уже
  закреплённых immutable arrays для проверки source receipt
- **THEN** этот cached-array validation разрешён без model runtime/Torch/bpy, новой позы или поиска
- **AND** новый model/FK evaluation за пределами такого readback не допускается

#### Scenario: Все correspondence prerequisites пройдены

- **WHEN** typed provenance, vertex/rig/quad/CC/ROW bindings, stage parity и GN no-op подтверждены
- **THEN** разрешается только подготовить отдельно рассматриваемый diagnostic-copy writer
- **AND** saved-copy/fresh-nails/export/browser/visual и полный physical admission остаются
  открытыми

#### Scenario: Частичный результат или незавершённая публикация

- **WHEN** обход неполон, output partial либо committed readback не подтверждён
- **THEN** COMPLETE certificate и prerequisite не выдаются, исходные receipts не меняются
