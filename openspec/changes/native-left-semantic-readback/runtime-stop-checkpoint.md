# Остановка native LEFT на пользовательском deadline

Статус: **FAILED_PARTIAL_AT_USER_DEADLINE_NO_AUTHORITY**. Публичных assets и изменений runtime нет.
Это частичная готовность NoSave helper, полный native LEFT save/reopen не выполнен.

## Что подготовлено

- Pure native LEFT generation: raw hand/pads из frozen native IDs; пять ordered Float64 sums с
  единственным F32 conversion. Typed ROW gather/scatter и old named-attribute slot normalization,
  включая active identity по имени.
- Private CPU suite: 27 PASS — raw provenance/chain/F32, nonfinite/dtype, несимметричный ROW
  three-cycle, old payload/builtin/schema, active identity, alias/hardlink/stale/partial, exact
  two-root guard и реальный Windows junction.
- E-only PLAN `8af2633bf5033bfbd690f4391d07c19b15244159213afbb29a04b44f051fce1b` был остановлен до
  Job/Blender/copies: available3,114,721,280 bytes < required7,546,613,864. Threshold не уменьшался;
  прежние E labs/proofs не удалялись.
- Новый C-runtime PLAN `b5ca92dbce06e947`, SHA
  `91221fa51a9297305b21969ea304db0ae71f740c303787a2f8458c090e77fb1f`, 414 pins, прошёл root и
  независимый code/PLAN review. Код/PLAN/rawprep остались в NEWLEFTWT; только runtime outputs
  использовали отдельную папку C.

## Фактический NoSave прогон

Exact output: `%LOCALAPPDATA%/Temp/piano-left-native-smoke-20261115-v2/runs/a0e60e4e26f1fb5b`.

Managed session31990, Blender PID37780. Log дошёл через before/after five-stage captures
на1671/1672/1673 до `LEFT_SMOKE_SOURCE_SNAPSHOT_AFTER`. Добавления были только RAM-only на
существующем diagnostic skin. Full124, сохранение .blend и fresh reopen в этом smoke не выполнялись
и не заявлялись.

В `2026-11-15T19:59:00.013376Z` общий first-event receipt зафиксировал пользовательский deadline:
`deadline_stop=true`, `limit_stop=false`, fresh account snapshot имел35% remaining. Guard остановил
owned Job; после этого новых runs/retries/development не было.

`child/report.json`, host `report.json` и `SMOKE_VERIFIED.json` отсутствуют. Поэтому actual
six-field oracle, complete old-field proof и общий smoke PASS не объявляются. Существующие partial
arrays/logs сохранены без salvage или продолжения.

## Cleanup и сохранность

- Сессия31990 consumed: tool exit1; guard запросил host exit70 через frozen JobGuard. Blender37780
  отсутствует по WinAPI; scoped CIM не нашёл Python/Blender с exact v2 profile.
- Индивидуальные RPC PID не записывались. Их cleanup следует из inherited KillOnClose Job; отдельная
  per-RPC PID проверка не заявляется.
- Original source SHA `9f3ae5f1c731c07693637b19aed31541f6c29d6c77713823af437fb4ad4dc9ff` сохранился.
- Accepted V6 saved input, reserve и work copy сохранили SHA
  `1bd86192128552b90fe4ebdb8abfff0df4a531463036a5d8f1b31594be80b87d`.
- Durable receipts: C runtime `actor-started.json`, `guard70-stopped.json`, `actor-final-exit.json`;
  E-only refusal — private lab
  `native-left-semantic-readback-20261115/runs/63ed8d888fd06bda/preflight-failed.json`.

Полный literal631 V6 roundtrip с независимым strict read остаётся PASS и не изменялся. Native LEFT
full124/save/reopen, nails, arm, contact, animation, export/gameplay/visual остаются открыты.
`physical_class=null`, `calibration=null`, `eligible_for_write=false`, `serialization_ready=false`.
