# Задачи

Private certificate v2 завершён: 90 CPU tests, independent readiness/final scope review и root
static replay + отдельный committed readback PASS. Writer не входит в этот change и не запускался.

## 1. Immutable intake и typed identity

- [x] 1.1 Подготовить новый private PLAN для одного literal631 с V6/child/producer/source binding;
      pure prepare не импортирует Blender/Torch и не меняет inputs; использовать обязательные frozen
      committed readers с их existing immutable cached NumPy FK/LBS readback, без нового model
      runtime, поиска или самодельного ослабленного envelope reader; проверить
      SHA/scope/missing-file negative fixtures и сохранить полный input manifest.
- [x] 1.2 Реализовать typed array schema/value comparison и base6890/rig binding; pure tests
      проверяют разные integer dtype при равных values, overflow/range, vertex permutation,
      full-weight pruning, wrong parent/rest и отдельную actual Basis identity; самостоятельные
      Float32 rest-поля проходят только при всех трёх именованных positional ошибках≤existing1e-5m;
      превышение каждого bound, source-hash или прежний rotation failure отклоняется без изменения
      immutable v1 artifacts.

## 2. Quad chart, CC и ROW

- [x] 2.1 Проверить все ordered actual polygon/loop/triangle bindings и frozen oriented pair
      boundaries; pure tests отклоняют diagonal outside quad, repeated vertex, reversed winding,
      quad reordering и missing coverage; positive fixture допускает только внутреннюю diagonal
      change.
- [x] 2.2 Воспроизвести native CC topology без model/FK/Torch и построить отдельный typed bijective
      actual-quad/native-CC/cyclic-start bridge; pure tests проверяют иной native face order,
      неоднозначный/reversed/missing bridge и отсутствие geometry reindex.
- [x] 2.3 Выпускать отдельный ROW sidecar только после base/rig/quad/CC proof; pure tests
      повреждённого ROW и duplicate IDs обязаны отказать, исходные V6 assets остаются
      byte-identical; документировать actual-triangle → actual-quad ← frozen-triangle provenance без
      переноса triangle-local evidence.

## 3. Stage parity и ограниченная authority

- [x] 3.1 Добавить static pre-LBS/LBS/preGN/head comparison, явные coordinate spaces и diagnostic
      FP32 errors; pure fixtures проверяют double transform, tolerance boundary и
      ненулевой/неподтверждённый PAD/SIDE; физические thresholds/calibration не меняются.
- [x] 3.2 Добавить optional changed-quad mask coverage после ROW binding; pure tests не разрешают
      вывод о LEFT по RIGHT или грубому LEFT arm mask, а нулевая membership не переносит physical
      proof.
- [x] 3.3 Добавить новый profile/authority и typed atomic publication/independent reader; negative
      tests partial/stale/tampered receipt не дают COMPLETE или prerequisite, старый exact-TRI
      failure и class/calibration=null/eligible=false сохраняются; описать offline replay команду в
      private PLAN.

## 4. Независимая проверка и один replay

- [x] 4.1 Провести независимое review private PLAN/code/tests до запуска; reviewer подтверждает
      неизменность frozen гейтов, no-remap и отсутствие inherited collision/BVH/cap/nail evidence.
- [x] 4.2 Выполнить один pure CPU static replay и независимый committed readback по полному
      coverage; сохранить измеренные errors/bridge/actual triangulation и все input/output SHA
      локально, проверить source/old receipts неизменны; tracked статус явно отделяет diagnostic
      prerequisite от ещё открытых writer/save/reopen/fresh-nails/physical этапов.
- [x] 4.3 Выполнить relevant pure tests, `pnpm check` и `pnpm spec:validate`, сверить private-data
      exclusion и получить независимое итоговое review; до этого не объявлять change завершённым.
