# Проверка diagnostic roundtrip, 15 ноября 2026

Статус: **V6 DIAGNOSTIC_ROUNDTRIP_ONLY PASS**. Реальный writer и отдельный fresh reader завершились
exit0; полный host typed proof создал `report.json` и `COMMITTED.json`, затем host завершился exit0.
Независимый финальный `--read` завершился exit0: `INDEPENDENT_COMMITTED_READ_PASS` (reviewer
session83853). Публикация PR отложена до установленного пользователем STOP.

Physical class/calibration остаются `null`, `eligible_for_write=false`, `serialization_ready=false`.
Accepted atlas и public assets не обновлялись.

## V6: подтверждённый сохранённый результат

- Immutable PLAN `17de73181838f806`, SHA
  `d0570047953ab680a7733743da60810c58556ee51e0488ead851d84ca761bace`, 387 pins.
- Report
  `blender/labs/literal631-diagnostic-roundtrip-20261115-v6/runs/d27a27e9fed03014/report.json`, SHA
  `be8122465b6853bb72c12d7a60998aa025d35229875538e9277aa4034a107bbc`.
- COMMITTED SHA `0b6b04bab565fc487bb85bd9d92b1b01cd84eb1e117266862d994cd0aa16aa59`.
- Новый saved `.blend` SHA `1bd86192128552b90fe4ebdb8abfff0df4a531463036a5d8f1b31594be80b87d`;
  source/reserve/work copy сохранили SHA
  `9f3ae5f1c731c07693637b19aed31541f6c29d6c77713823af437fb4ad4dc9ff`.
- Writer PID57296 exit0, 810,00 с; отдельный reader PID54732 exit0, 791,33 с; host PID61416 exit0.
  Все три PID отсутствуют по независимому WinAPI readback; чужие процессы не останавливались.
  Durable hostexit receipt находится в
  `blender/labs/session-journal-20261115/1794770537882126200-v6-host-exit.json`.
- Все четыре source/diagnostic mappings на union124 совпали exact. Старые curves/handles/metadata,
  source structural snapshots, 52 rig/rest/weights и geometry всех88keys прошли полную проверку.
- Shape-only geometry и raw pre-LBS F32 payload совпали exact. Максимальная ошибка geometry пяти
  stages `3.5762786865234375e-7` м при заранее закреплённой границе `1e-5` м; rig matrix error не
  выше `5.364418029785156e-7`. PAD/SIDE остаются exact no-op. Writer/fresh reader stage arrays и
  dtype совпадают.
- Native reference identity/value/coordinates сохранены exact; все остальные old correctives=0,
  новый=1 на N1672, guards1671/1673 восстанавливают terminal. Это проверка native pointer metadata,
  без исключения по имени «Basis».
- Actual topology сохранена; old exact TRI gate остаётся `FAILED_UNCHANGED`, piecewise linear
  surface equality=false. RIGHT nails — reference-only sampleN, `NOT_EVALUATED`;
  physical/contact/LEFT/export/gameplay/visual не принимаются этим proof.

V6 использовал controlV2 SHA `6ba3fcc9e7f967488723d92c6542470adbfc456d353e668cd84beffcedd75230`:
только RPC children явно NORMAL, host/Blender BelowNormal/CPU0..5. Failure retry5s не обновляет
cache age; strict90s,70used/30remaining, deadline19:59UTC и общий first-event STOP path сохранены.
Перед actual run отдельный paired read-only probe завершился exit0 за175,085с: четыре fresh RPC,
actual NORMAL32, host BelowNormal16384/affinity63, все owned PID завершены. Evidence SHA
`d288c13b02470a528f00ae428f36cac92492c7c85fd5ccbafbf8d6d522c87c49`.

## Подтверждено

- Новый worktree `pt-agents/night-blender-20261115`, ветка `work/night-blender-20261115` от
  `origin/dev` `ad544f5d`. Основная папка/dev и пользовательский 5190 не менялись.
- Проверены fresh committed correspondence/producer readers, native vertex/quad bridge и source
  .blend SHA `9f3ae5f1c731c07693637b19aed31541f6c29d6c77713823af437fb4ad4dc9ff`.
- Read-only inventory закрепил максимальный keyframe 1670, marker/frame_end 1669; новый sample
  N=1672, guards 1671/1673. Все 64 сохранённые позы и frozen C4/sentinels образуют union 124 кадров.
- Независимые spec/code/PLAN reviews подтвердили ограниченный diagnostic-only scope. Все модели,
  сцены, arrays, private scripts и receipts остаются ignored.

## Реальные отказы до сохранения

| Прогон    | План и SHA                                                                             | Результат                                                                                                                               |
| --------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Writer v1 | `85de446acce2bcf9`, `1605663ac7bd1a8166e69867c5e66a3154aa147dfa1f44ecc108ecdd3e2eaf84` | После source guards отказ `ALL_OLD_SHAPE_RIG_KEY_CURVES_EXACT`; сохранения не было.                                                     |
| Writer v2 | `cd1c345e3bf83ef2`, `1fcc6d7afc7f7a60d37153eb4b1b4b05660e276c1d5bcc9aa6f8420876304380` | Exact old-curve gate пройден; после 124 diagnostic guards отказ `ALL64_AND_SENTINELS_UNCHANGED_IN_COPY`. Сохранения и readback не было. |

## Writer V3: сохранённая копия получена

После отдельного независимого review выполнен новый V3 PLAN `d0ca5ca03bb583d2`, SHA
`6f7064a4dc155faf1eb29d2025b19eac4c40e96d2dec00b085be66d0bde2df05` (384 pins). Writer завершился
exit0 с `COMPLETE_DIAGNOSTIC_WRITER`: все 124 source и 124 diagnostic frame hashes совпали exact.
Новый private файл:
`blender/labs/literal631-diagnostic-roundtrip-20261115-v3/runs/b121286043e2268b/output.blend`, SHA
`1bd86192128552b90fe4ebdb8abfff0df4a531463036a5d8f1b31594be80b87d`.

Исходный файл сохранил SHA `9f3ae5f1…`. Оба отдельных Blender процесса завершились exit0: writer
сохранил сцену, reader открыл именно saved output и повторил 124 source/diagnostic guards. Все
четыре frame-hash mappings совпали exact; source snapshots и authoring metadata writer/reader
совпали. Однако host proof завершился отказом `OLD_CORRECTIVES_ZERO_NEW_ONE:Basis`; `report.json` и
`COMMITTED.json` отсутствуют. Независимый disk replay подтвердил этот отказ.

В actual source/terminal/writer/reopen/guards native reference key имел value=1.0 и сохранился
exact. Host validator ошибочно требовал ноль от reference вместе с corrective keys. V3 profile и
failed outputs остаются immutable. Новый V4 profile закрепляет native reference
identity/value/coordinates в PLAN и сохраняет zero-only требование для всех остальных old
correctives, new corrective=1. 51 CPU regression tests PASS; новый actual run ещё не разрешён и не
выполнен. Это actual save milestone, не завершённый saved-copy proof или physical admission.

V2 различает existing empty curves и новые whitelisted channels с ровно тремя CONSTANT guards;
старые handles/modes/metadata восстанавливаются exact. Existing generator/mute/extrapolation не
исключаются из проверки. Исправление не снимает исходный old64/geometry gate.

Оба failed профиля, их code/inputs/plans/outputs сохранены без изменений. В обоих source/reserve и
work copy сохранили исходный SHA. Собственные Blender/host процессы завершились; серверы задачи не
запускались.

## NoSave differential

Отдельный короткий read-only прогон на frames 1/631/794 завершён с полными typed per-field
observations, без authoring и без сохранения. На каждом frame уже **до authoring** отличаются 13
prototype objects: `bench`, `black`, `board`, `cheek`, `panel`, `pedal-base`, `pedal-plate`, `slip`,
`table`, `white-cut-both`, `white-cut-left`, `white-cut-right`, `white-full`.

Число evaluated vertices source→clone: black 8→216, board 8→96, white-full 16→160, bench 877→1641. У
bench также наблюдалось world-matrix различие до 0,430000007 м. SMPLH skin/rig и 88 key objects на
этих трёх frames не отличаются.

Отдельный direct visibility probe подтвердил причину: source collection `piano_kit` имеет
`hide_viewport=true`, `hide_render=true`; manual clone переносил её объекты прямо в видимую
`Scene Collection`. `hide_get` и modifier flags совпадали, но `visible_get` менялся false→true,
поэтому начинали применяться modifiers. Source .blend не менялся.

Новый isolated helper сохраняет collection DAG и shared object membership, collection/view-layer
visibility и object base hide. Его отдельный NoSave exact check дал **0 различий по всем objects и
typed fields** на frames 1/631/794 (39,04 с, peak host+child 4,06 GB). Три frames не заменяют полный
124-frame guard, а NoSave observations не являются saved-copy proof. Новый полный V3 PLAN с
control70 прошёл отдельное review; фактический save и текущий статус readback описаны выше.

Private artifact:
`blender/labs/literal631-copy-differential-20261115-v2/runs/df02b11a4ee488b3/child/report.json`.
Первый differential profile завершился на import bootstrap до Blender-логики; он также сохранён
отдельно, а исправленный профиль имеет собственный новый PLAN.

Private fixed-copy proof:
`blender/labs/literal631-copy-visibility-fixed-20261115/runs/75830161fbd10069/child/report.json`,
SHA `9a5a2e3ed5493c673cce291494583dc6c9b27cc756ac8dff0ff190646202f885`.

## Проверки

- `pnpm check`: PASS, 5336 unit tests, 10 existing skipped, 30 compiler tests;
  typecheck/lint/format/build PASS.
- `pnpm spec:validate`: 103/103 PASS; старое предупреждение duplicate task 1.7 относится к
  `game-visual-update`.
- Private CPU fixtures: V1 33, V2 41 PASS; negative cases включают alias/hardlink/stale source,
  typed arrays, no-op, shape activation, old curves, nested assets и process receipts.
- Frozen Windows Job fixtures: 11 PASS, включая forced host termination и прекращение owned
  child/grandchild.
- NoSave differential fixtures: 5 PASS.
- Collection/visibility regression fixtures и differential: 10 PASS; новый V3 private CPU suite: 48
  PASS (до actual save/reopen).

## Новый предел пользователя

Позднее пользователь явно установил более ранний из двух stop events: 15 ноября 23:59
Europe/Astrakhan или остаток любого предоставленного account window не выше 30%. Это заменяет старый
weekly89 предел для дальнейших работ. Frozen old profiles не переписываются.

Новый private control70 читает все предоставленные rate-limit buckets и primary/secondary, проверяет
fresh≤90 с, обновляется каждые 50 с и контролирует deadline/stop каждые 0,5 с. Непредоставленное 5h
окно не выдумывается. Policy fixtures 11 PASS; отдельные реальные owned process-tree tests
подтвердили остановку по quota/deadline/stale без завершения чужих процессов. Последний записанный
snapshot 17:25:57 UTC: weekly 57% used / 43% remaining; secondary=null. Это время наблюдения, не
обещание текущего остатка.

После первого stop разрешены только упаковка, cleanup и согласованные commit/push. Новые writer/save
runs требуют нового pinned плана, review и control70. Native LEFT semantic readback остаётся
следующим этапом после настоящего saved-copy proof; nails/physical/contact/animation этой работой не
закрыты.

## Последующие V4/V5 отказы

V4 прошёл независимый code/PLAN review, но команда ошибочно передала относительный PLAN path в child
с другим cwd. Blender завершился до прикладной логики, save/readback не было. Новый V5 runtime
нормализует путь до validation/spawn; отдельная regression проверяет абсолютный child argv при
отличающемся cwd. V5 CPU suite: 52 PASS, immutable PLAN SHA
`6db7922f90ac330a25ccdac9d8f3bb93b9cf6415833807b96dd30307558e6c88`.

V5 writer прошёл до source guard 81/124 и был остановлен `QUOTA_STALE_FAIL_CLOSED`: последний
собственный account snapshot 18:34:12 UTC имел 39% remaining, но достиг возраста 92,86 с. Это
fail-closed остановка из-за отсутствия свежего RPC, а не достижение user threshold/deadline. Saved
output/readback/COMMITTED не появились. Source/reserve/work copy не изменились, owned writer/host
завершены.

Отдельный разрешённый read-only refresh probe без Blender воспроизвёл проблему: initial NORMAL RPC
завершился за 1,07 с; после host BelowNormal/affinity63 RPC наследовал эти параметры, один запрос
занял 21,75 с, следующий дал `ACCOUNT_RPC_TIMEOUT`. Последний fresh snapshot затем достиг возраста
90,052 с, owned Job был завершён. Priority/affinity наблюдены фактически; их исключительная
причинность пока не установлена. Frozen controller и все failed profiles сохраняются без изменений.
User STOP ещё не подтверждён: fresh snapshot 18:37:56 UTC вновь показывал 39% remaining,
deadline=false.

## Финальная приёмка bounded change

Независимый reviewer подтвердил V6 `INDEPENDENT_COMMITTED_READ_PASS`, CLI exit0, session83853: exact
PLAN387pins, source/reserve/workcopy/saved SHA, все nested typed
assets,124guards,5stages,52rig,88keys,no-op,native reference и process lifecycle.
Host61416/writer57296/reader54732 отсутствуют. Private V6 CPU suite53 PASS; controlV2
policy/scheduling/owned-process tests15 PASS. Полные product checks выше относятся к этому docs-only
worktree; private scripts и модели в Git не добавляются.

Implementation/runtime/review tasks закрыты. Пункт публикации остаётся открытым до пользовательского
STOP: commit/push/PR только после deadline либо любого remaining<=30. Следующая native LEFT semantic
задача имеет только текстовый scope и read-only инвентаризацию; actual native LEFT save/reopen ещё
не выполнен.
