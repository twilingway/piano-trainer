# Устройство статического correspondence-профиля

## Context

См. [proposal.md](proposal.md). Это additive diagnostic profile к
[verified-pianist-runtime](../verified-pianist-runtime/design.md); его старые pinned
design/tasks/spec не изменяются. Текущий V6 даёт observations/restoration, а не ROW или
serialization authority.

Локальные immutable inputs относительно LAB `continuation-20261028/`:

| Вход                                                               | SHA256                                                             |
| ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `literal631-blender-stagecapture-v6/runs/6f4b8954eed0/report.json` | `fbcdeff0fb0da1acbf0c3e67e7eeb7b0a2695a59c2e18ab407906d304052aefe` |
| Его `child/child-report.json`                                      | `775cb55c55664c7db136b376071d4fe6a5317a61ff25cd970d5c6307ab5c2d18` |
| `literal631-stagewise-producer-v2/runs/42489f6c2ee0/report.json`   | `a662db6bc3c854a9db41258b756a356f939c18c74e6ce5ff0395a35ef7930da9` |
| Его `literal631-stagewise.npz`                                     | `650678d23a22800d60a4ccd00a39f22234aa01573d5dc3e86a60e9f92725b8e8` |
| Saved source literal631                                            | `9f3ae5f1c731c07693637b19aed31541f6c29d6c77713823af437fb4ad4dc9ff` |

Actual preGN/PAD/SIDE triangle SHA:
`7caa0844fc5f8423067841125e845ab91b5b4dcde92a523731c6f821b2ceb93e`; frozen triangle SHA:
`4afb00012c519c7f0044f7fba262fff692fab1f927fd605a9db5a4fa131f6fa7`. 20 mismatching rows относятся
к10quad: 27203,63498,63603,76767,77802,93495,95727,110979,155070,159417. Эти observed counts
являются replay evidence, а не whitelist допустимых ошибок.

## Goals / Non-Goals

**Цель:** новый immutable сертификат одного literal631 и отдельные typed sidecars, без поиска.

**Вне области:** private certificate implementation в этой документационной задаче; Blender
capture/writer, новые model/FK evaluations вне immutable cached readback, GPU, новые correctives,
runtime, source-array edits и physical admission.

## Decisions

### 1. Pure static core и thin file shell

Новая ignored private лаборатория владеет чистыми CPU/NumPy проверками topology, types, coverage,
численного сравнения уже полученных arrays и authority. Оболочка читает immutable receipts,
проверяет SHA и публикует новые outputs через отдельный reviewed atomic adapter. Обязательные frozen
committed readers вызываются без ослабленного envelope reader: их существующий NumPy FK/LBS readback
проверяет только immutable cached literal arrays и исходные receipts. Этот ограниченный readback не
загружает model runtime, Torch/bpy, не генерирует позы и не запускает новый поиск. За его пределами
новые model/FK evaluations запрещены. Никакой React/view или runtime загрузки: frame loop, OSMD и
PracticeSession не получают вычислений или новых зависимостей.

### 2. Typed evidence отдельно от validation views

Каждый input/output manifest содержит dtype, shape, ordered-byte SHA и generation. Temporary integer
widening допустим только после range/schema checks для сравнения значений; исходные bytes не
перезаписываются. `values_equal` и `typed_equal` независимы. Смена dtype не делает SHA одинаковыми.

Source6890 binding проверяется по ordered base faces и их IDs, полным52weights, bone
order/parents/rest и frozen source rig provenance. Float64 source weights сравниваются с actual
values через явно объявленное точное Float32-представление; обе исходные identity и max error
сохраняются. Не допускаются top4/pruning, renormalization, nearest matching или другая shape.

Basis имеет собственный observed hash; равенство bare template не требуется и не заявляется.
Проверяется active pre-LBS полный posed payload, не inverse PSD. Доступные world-joint heads
сравниваются напрямую; новые FK evaluations для этого сравнения не выполняются. Существующий
cached-array readback обязательного frozen reader остаётся разрешённой проверкой его receipt. Для
positions/head errors применяется diagnostic `1e-5m`, не физический допуск. Rotation/rest
descriptors и source hashes остаются частью отдельного rig binding; линейные, угловые и weight
ошибки не смешиваются одним tolerance.

`rest_head` и translation-часть `rest_matrix` — самостоятельные captured поля с собственными typed
hashes. Их byte equality не требуется: source Float32 поля могут независимо хранить округлённые
позиции. Оба поля сохраняются без snap, усреднения или пересборки. Reference —
`rest_joints_source52 @ C.T` в rest-local координатах без body translation. Из уже закреплённых
arrays проверяются три именованных max-absolute-component ошибки в метрах:

- `rest_head_to_producer_m`;
- `rest_matrix_translation_to_producer_m`;
- `rest_matrix_translation_to_rest_head_m`.

Каждая обязана быть не больше существующего diagnostic position bound `1e-5m`; граничное значение
допустимо, превышение любого сравнения отклоняется. Это замена неподтверждённого exact cross-field
предположения, а не изменение rotation/affine/dimensionless, source-hash или physical гейтов. Данный
контроль не выполняет новый model/FK evaluation; immutable v1 snapshots/plans/failed run сохраняются
отдельно.

### 3. Ordered quad chart без geometry remap

Для каждого actual polygon k проверяются row indices, loop start/length4, ordered loop vertices,
triangle_loop_indices, triangle_polygon_indices и полное покрытие. Обе actual triangles принадлежат
этому polygon; frozen pair2k/2k+1 обязана иметь ту же directed boundary. Internal edge взаимно
погашается; остаётся один ориентированный4cycle, привязанный к actual loop start, с4различными IDs.
Reversed cycles, triangle outside quad, duplicate/missing pairs и quad reordering отклоняются.

Actual и frozen arrays остаются в исходном порядке. Cyclic comparison лишь проверяет связь границ,
не сортирует vertex IDs и не создаёт новую triangulation. Полная oriented boundary проверяется
для165312quad, а не только для10observed mismatches.

### 4. Явный native CC bridge

Из pinned ordered source faces и6890IDs pure topology walk воспроизводит два native CC refinement
шага, без model positions, stencil numerical evaluation или Torch. Source edge keys могут быть
каноническими unordered endpoints для построения connectivity; geometry arrays не сортируются.

Native CC polygon order исторически отличается от Blender. После применения закреплённого
`evaluated_id_to_source_ROW` только к validation view каждого actual quad строится typed связь
`actual_quad_id -> native_cc_quad_id, cyclic_start`. Требуются unique oriented match и bijection по
всем165312quad и165314vertex IDs. Reversal не считается cyclic match. Bridge не применяется к actual
arrays. Нет однозначной связи — нет certificate.

Источник ROW — immutable producer/map с exact typed hash, не заново подобранная permutation.
Отдельный output ROW sidecar выдаётся лишь после base/rig/quad/CC проверок; V6 arrays не
дополняются.

### 5. Stage comparison и actual triangle authority

Shape-only, LBS и preGN сравниваются с producer в подтверждённой системе координат. Transform
применяется ровно один раз; local/world/units фиксируются по полям. Actual PAD/SIDE no-op
подтверждается полными stage arrays/attributes/topology V6 и повторяется статическим replay.

Разные диагонали nonplanar quad могут давать разные внутренние поверхности. Новый сертификат
подтверждает vertex/quad relationship, но не piecewise-linear surface equality.
`actual_triangle_id -> actual_quad_id <- frozen_triangle_id` — отношение provenance, не
взаимозаменяемость triangle IDs или barycentric coordinates. Полный actual array сохраняется без cap
rewrite; последующие collision/BVH/nail/cap проверки должны использовать эту triangulation.

### 6. Ограниченная полномочность и публикация

Новый profile/scope: `CERTIFIED_VERTEX_QUAD_CORRESPONDENCE_ACTUAL_TRIANGULATION`, authority
`VERTEX_AND_QUAD_CORRESPONDENCE_ONLY`. COMPLETE возможен только после полного typed committed
readback; partial output не authority.

`diagnostic_roundtrip_prerequisites_pass=true` требует всех bindings, stage parity и GN no-op. Это
prerequisite только подготовки нового reviewed copy-writer. Сам сертификат не создаёт сцены и не
обходит accepted-write bridge: class/calibration=null, eligible_for_write=false. Исходные V6
`serialization_ready=false` и exact-TRI failure остаются неизменными. Fresh nails/LEFT
semantics/saved-copy/export/browser/visual/physical gates не наследуются.

### 7. Mask statistics после identity

Changed-quad membership разрешена только после ROW binding. RIGHT masks фиксируются собственными
именами; native LEFT читается из source `native_LEFT_POINT_FLOAT_by_ROW` с отдельным SHA. Грубый
`pilot_arm_L` не заменяет native LEFT hand/pad/finger evidence. Статистика отражает membership
конкретных mask sets, не геометрическую или анатомическую классификацию. Даже нулевая membership не
разрешает перенос full-surface proof.

## Risks / Trade-offs

- Другая диагональ меняет внутреннюю поверхность quad → сохранить actual triangulation и потребовать
  новые triangle-based proofs.
- CC bridge принят за remap → хранить его отдельно; actual vertex/quad/triangle arrays неизменны.
- Float32 residual принят за калибровку → diagnostic tolerance именован, measured errors и
  физические статусы раздельны.
- Неполное совпадение выдано за COMPLETE → coverage по всем IDs и отрицательные fixtures до replay.
- Private derivatives опубликованы → все arrays/model inputs/certificate outputs остаются ignored;
  tracked artifacts содержат только контракт и статус.

## Migration Plan

После независимого review и validation этого addendum — новый private PLAN, pure tests и один static
replay. Старые профиль, receipts и три pinned OpenSpec-файла не меняются. Новый prerequisite
потребляет только отдельно рассматриваемый diagnostic writer; его implementation/save/reopen не
входит в этот change. При отказе новый certificate отсутствует, прежние outputs сохраняются.
