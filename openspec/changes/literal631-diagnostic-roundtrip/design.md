# Диагностическая копия literal631

## Context

См. proposal.md. В private лаборатории 2 ноября завершён correspondence v2: 165314 vertex/ROW,
165312 quads; 20 actual triangle rows в 10 quads отличаются от старого source proof. Это позволяет
diagnostic roundtrip, но не перенос старых collision proofs. Ранее подготовленный yaw writer
содержит только design, безопасного исполняемого writer нет.

## Goals / Non-Goals

**Goals:** один CPU-only writer/save/reopen, immutable inputs, отдельная диагностическая сцена,
observable guard receipts.

**Non-Goals:** новые позы/поиск, Torch/GPU, исправление контактов, native LEFT nails, physical
promotion, public GLB/loader или игровая анимация.

## Decisions

1. Private host проверяет committed producer v2 и correspondence v2 штатными frozen readers. Их код
   и inputs не переписываются. Нормативные snapshots отделены от mutable task/status files.
2. Новый worktree содержит ignored `blender/labs/literal631-diagnostic-roundtrip-20261115/`. Private
   immutable PLAN фиксирует code/input hashes, source file, output root, frame inventory и exact
   64-pose manifest. Source reserve и work copy создаются exclusive byte copy; save только в новый
   `.blend`.
3. В copied file создаётся отдельная диагностическая сцена с независимыми rig/skin/key/nail object
   data и actions. Original scene сохраняется. Любой общий mutable datablock обнаруживается до edits
   и вызывает отказ. Read-only materials/GN groups остаются неизменными; source-bound GN
   dependencies сохраняют hashes.
4. Reserved N выбирается после всех action/key/marker frames и guard frames. Новая shape key имеет
   absolute pre-LBS F32 coordinates и value1 только на N; old correctives=0 на N. Rig получает
   quaternion basis из закреплённых source rotations и rest basis; 88keys получают literal631 state.
   На N-1/N+1 восстановлены прежние terminal values, CONSTANT interpolation. Добавления не изменяют
   существующие curve points/handles.
5. Сохранность доказывается union всех 64 accepted frames, frozen C4 и старых sentinels. Перед
   writer и после fresh reopen сравниваются exact hashes evaluated geometry/rig/key state и
   существующих datablocks/fcurves; новый diagnostic scene имеет собственный whitelist. GUI/MCP не
   используется.
6. Writer и readback работают последовательно в background Blender с disable-autoexec, private
   config, CPU0–5/below-normal/threads1. Frozen Windows Job Object lifecycle завершает descendants
   при закрытии host. Host управляется сессией инструмента; detached процессы запрещены.
7. Независимый readback сохраняет пять actual stage assets и rig/key/nail references, проверяет
   exact actual topology и typed arrays. Diagnostic comparison to producer ограничен 1e-5м; PAD/SIDE
   и source/frame invariants exact. Старый exact TRI gate остаётся FAILED_UNCHANGED.
8. Complete receipt появляется только после независимого host reread, source/reserve hashes и
   завершения обоих child processes. Всегда scope DIAGNOSTIC_ROUNDTRIP_ONLY, physical/calibration
   null, eligible/serialization false. FAILED output не удаляется и не получает authority.

Pure contract/proof modules владеют shapes, hashes, output policy и comparisons; Blender shell
только читает/пишет native data. PracticeSession, renderer и staff frame loop не затрагиваются.

## Risks / Trade-offs

- Blender animation API или shared datablocks → preflight inventory и fail closed; без обхода
  проверок.
- Много старых кадров → CPU-only sequential hash capture, bounded один sample; большие arrays
  сохраняются только для пяти новых стадий.
- Отличающаяся triangulation → actual topology сохраняется; никакого reindex/repair или inherited
  collision certificate.
- Reference nails631 не являются fresh candidate seating → scope явно reference-only, LEFT/physical
  остаются открыты.

## Migration Plan

Production миграции нет. При отказе сохраняется isolated diagnostic output; source и accepted сцены
не меняются. Новый corrected plan получает отдельную версию, старые планы и прогоны immutable.
