# Проектирование native LEFT readback

## Context

Мотивация и границы — в proposal.md. Предыдущий literal631 roundtrip обязан иметь complete COMMITTED
receipt и независимое чтение перед любым новым actual запуском. Его partial/FAILED профили не
являются входным допуском. На момент подготовки этого контракта финальный review ещё ожидается;
новый writer не разрешён.

## Goals / Non-Goals

Проверяем происхождение и сохранение скалярных полей в Blender. Чистая приватная подготовка массивов
владеет вычислением значений; Blender shell только добавляет declared поля, измеряет, сохраняет и
повторно читает. Production pure core, PracticeSession, React и кадровый цикл не меняются. В runtime
не появляется дополнительная нагрузка или новый источник времени.

## Decisions

1. Вход закрепляется точными SHA complete roundtrip report/COMMITTED, saved .blend, original source,
   correspondence и исходных полей. Source и accepted atlas доступны только для чтения; работа
   ведётся в новой exclusive byte-copy с собственным output.
2. Кисть и пять pads происходят из исходного native LEFT raw layout без отражения RIGHT. Пороги
   distal weight >0.15, beyond 5 mm, palmar slab 3 mm, hand/evaluated >0.5 и separate permission /
   preferred-thumb семантика сохраняются. Raw source schema, namespace и source-ID space входят в
   PLAN; неоднозначность имени или происхождения блокирует исполнение.
3. Пять finger fields — сумма трёх LEFT chains исходных Float64 weights 6890×52, затем одно
   приведение к Float32: thumb34–36, index22–24, middle25–27, ring31–33, pinky28–30. Top4, pruning,
   renormalization и сумма уже округлённых Blender Float32 groups не используются. Отрицательные
   fixtures различают неправильную цепочку и повторное F32-округление.
4. Реальная Blender interpolation измеряется на 165314 evaluated vertices. Для шести полей
   используется отдельно закреплённый actual native LEFT FLOAT-by-ROW reference и принятый
   vertex/quad bridge. Позиционный limit stencil и nearest-ремап не заменяют FLOAT interpolation.
   Пять новых finger fields получают собственные actual captures и exact save/reopen comparison; это
   проверка хранения/интерполяции, без унаследованного шестипольного PASS или physical смысла.
5. Полный список из 11 новых имён фиксируется до запуска. При сравнении старых атрибутов каждый
   named field связывается по name/domain/type/count с baseline metadata и восстанавливает прежний
   array-slot identity. Простое удаление новых attribute_<index> ошибочно при сдвиге индексов.
   Duplicate/missing/unknown attrs, несовпадающий dtype или count дают отказ. Все старые geometry,
   matrices, topology, triangle arrays, rig/rest/full weights, materials, old attrs и curves
   сравниваются exact; поля нельзя исключать из-за изменения индексов.
6. Baseline124 допускается только из independently committed/reviewed предыдущего roundtrip. После
   добавления полей и fresh reopen реально измеряются все 124 кадра, пять стадий, 52 rig channels и
   88 клавиш. Source snapshot и source-file SHA остаются exact. LEFT attrs сравниваются отдельно по
   typed payload; никаких pose/keyframe edits.
7. Два разных последовательных managed background Blender процесса, no-autoexec/private config,
   CPU0–5, threads1, BelowNormal, максимум 12 GiB, child1800s/total3600s и pinned disk budget. RPC
   обновления лимита имеет NORMAL_PRIORITY_CLASS, failed retry5s/success50s, cache age<=90s. Любое
   account window remaining<=30% либо 19:59 UTC 15.11 останавливает owned job и закрывает новые
   этапы. Общий first-event STOP не сбрасывается. При stale — отдельный fail-closed без ложного
   утверждения о threshold. Старые профили и контроллеры не переписываются.

## Точные identity и сравнения

Whitelist ровно: `native_left_hand_mask`, `native_left_pad_1`, `native_left_pad_2`,
`native_left_pad_3`, `native_left_pad_4`, `native_left_pad_5`, `native_left_finger_1`,
`native_left_finger_2`, `native_left_finger_3`, `native_left_finger_4`, `native_left_finger_5`.
Любая коллизия с существующим именем даёт отказ; whitelist не разрешает перезапись старого поля.
Изменяется только mesh существующего mapped `SMPLH Pilot Skin` принятой V6 diagnostic scene в новой
byte-copy. Exact scene/object/mesh datablock mapping закрепляется по принятому receipt. Новых
scenes, objects, poses, curves или keyframes не создаётся.

Для каждого chain `[j0,j1,j2]`: `F32((W64[:,j0] + W64[:,j1]) + W64[:,j2])` с двумя последовательными
Float64 сложениями и единственным F32 storage conversion. Raw hand/pads — 0/1 из frozen native IDs;
evaluated шесть полей — непрерывный actual Float32 результат. Порог >0.5 используется только для
отдельной membership summary, stored поля не бинаризуются. Пять новых finger evaluated fields
получают собственные наблюдения interpolation/save/reopen; oracle шести полей не объявляется
независимым oracle для остальных пяти.

Направление bridge: `r[e]` — certified actual evaluated vertex ID → source ROW.
`expected_actual[e,k] = frozen_by_ROW[r[e],k]`; обратная запись — scatter
`observed_by_ROW[r,:] = observed_actual`. Выражение `observed_actual[r]` не заменяет scatter.
Negative fixture содержит несимметричную трёхцикловую перестановку и разные значения строк.

Пять стадий снимаются на reserved N1672 и guards1671/1673; полный old union124 реально проверяется
после добавления полей и после fresh reopen. Original source scene сравнивается строго, без
normalization. В target разрешено только восстановление прежних array slots старых named attrs по
name/domain/type/count/dtype; builtin position, geometry, triangles, matrices, rig и keys не
исключаются. Active attribute восстанавливается по прежнему имени, если добавление меняет index.

## Risks / Trade-offs

- Сдвиг attribute slots → полное связывание старых полей по metadata, negative fixtures.
- Другая диагональ/BVH proof → actual triangles остаются точными; old exact-TRI FAILED не снимается.
- Интерполяция и rounding → отдельные raw/evaluated/reopened typed arrays, без расширения допуска.
- Скалярные weights легко принять за анатомию → отчёт только NATIVE_LEFT_SEMANTIC_READBACK_ONLY;
  physical/calibration null, eligible/serialization false, nails/arm/contact NOT_EVALUATED.
- Не хватит времени до пользовательского stop → immutable partial checkpoint; не продолжать actual
  после первого события и не объявлять отсутствующий saved/readback PASS.

## Migration Plan

Runtime migration отсутствует. Новый private output не подключается в игру. При отказе остаётся
отдельный FAILED receipt; source, accepted poses и прежние outputs сохраняются. В PR только текст.
