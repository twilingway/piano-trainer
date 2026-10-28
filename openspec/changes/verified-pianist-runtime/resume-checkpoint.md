# Checkpoint перед паузой, 28 октября 2026

Работа приостановлена по просьбе пользователя после завершения уже запущенных заданий. Новых
GPU-проверок после запроса не запускалось. Готовая игровая анимация ещё не получена. PR243 остаётся
draft; слияние и deployment не выполнялись.

## Фактическое покрытие

| Область                                 | Состояние                                                       |
| --------------------------------------- | --------------------------------------------------------------- |
| Выбранная модель                        | Серая основная модель52кости, та же Basis/rest анатомия Blender |
| Прежние64 исправленные позы и frozen C4 | Сохранены без изменения исходных сцен                           |
| Диапазон C2–C5 целиком                  | Нет нового полного подтверждённого прогона                      |
| Правая рука                             | Не завершена; остаются проблемные C3 frames592/593/598          |
| Левая рука/C6                           | Драйвер диагностики подготовлен; GPU reach/contact ещё NOT_RUN  |
| LEFT inventory74                        | Не закрыт новым физическим аудитом                              |
| Общий корпус, обе руки, ногти           | Полного joint world/saved/export допуска нет                    |
| Анимационные фазы и переходы            | Не реализованы как проверенное исполнение                       |

Накопленная старая сводка840GREEN/92YELLOW/686RED не является новым полным аудитом. Численный PASS,
static roundtrip и geometry kernel не заменяют physical admission.

## Что уже проверено

### Игровой риг и статическая поверхность

Production loader проверяет hierarchy/rest/root/mesh/bind/inversebind до принятия public атласа.
Wrong same-name rig отклоняется;33narrow tests и independent review PASS. Public52 и saved Blender
имеют одинаковые6890 Basis vertices/13776faces; rest/bind соответствуют Float32 округлению.

Полный приватный static export сохранённого кадра631 проверен actual Three против исходных6NPZ:
172564 уникальных vertices,345104triangles,6surfaces/7primitives,5RIGHTnails. Float32
POSITION/NORMAL совпадают побайтно, maximum world position error3,054e-16м.10tests/7negative
controls и review PASS. Видимый браузер показал body/hand/nails без console errors/warnings.
Стенд5191 закрыт. Это статический diagnostic gray material; UV/custom split normals, анимация и LEFT
nails не доказаны.

### Замкнутые объёмы

Получен первый полный вычислительный kernel v14 с двумя collar caps: global skin/self/cross checks,
exact degree+1, пять closed oriented genus0 частей и vertex links. Exact partition сохраняет все
original faces, physical masks и шесть query/ROW-наборов.21tests и независимый полный replay PASS.
Original skin immersion допускается вычислительным v3; прежние physical hard gates обязательны.

GPU BVH/refit/traversal прошёл25контрольных случаев, включая вложенность, winding cancellation,
origin/tangent/coplanar, unequal chunks/spill и overflow. Полные faces сравнивались с Fraction.
Результат — только synthetic proof; весь actual source ещё не классифицирован на GPU.

### Новый поиск C3

Новый непрерывный SDF objective сохранил прежний hard auditor. Из отдельной optimizer-копии88keys
убраны208 exact-zero triangles с рациональным доказательством покрытия; исходные meshes не менялись.
Обнаруженная CPU/CUDA разница sparse FP64 коэффициентов6,67e-16 решена точной привязкой к authentic
CUDA bytes, без tolerance, замены коэффициентов или изменения ROW.

Фактически выполнены3позы по5шагов.592/593 приняли5/5,598 —4/5. Все старые proxy-флаги ещё false.

| Frame | Численные active gaps после5шагов, мм      | Статус              |
| ----- | ------------------------------------------ | ------------------- |
| 592   | thumb1:1,681; middle3:3,243; pinky5:−0,302 | Новый exact NOT_RUN |
| 593   | 1:0,723;2:1,128;3:1,089;4:0,855;5:0,103    | Новый exact NOT_RUN |
| 598   | 1:3,458;2:0,693;3:−0,088                   | Новый exact NOT_RUN |

Эти gaps не доказывают корректный контакт или clearance. В ходе нового поиска raw collision terms
выросли; прежний skin/key PASS старого endpoint593 не переносится на новый. Подготовлен и независимо
проверен exact-адаптер:16pure tests PASS,476pins. Root exact3 не запускался из-за просьбы
остановиться.

### Подготовленный native LEFT/C6

Драйвер finite90seeds+2baselines написан локально;11pure/static tests и AST PASS,536pins.
Torch/model/FK/GPU в подготовке не запускались. GPU helper UNEXECUTED/UNREVIEWED; независимое
review, runtime parity, C6 reach/contact, world/nails/saved readback остаются NOT_RUN.

Expanded LEFT602 содержит0,30*learned mean: FREE22–33 сохраняются буквально. Mean повторно не
добавляется. Wrapper вставляет только active thumb34–36, использует masked leg PSD и новый source
provenance; source631 или RIGHT reflection не заменяют native LEFT.

## Что делать после возобновления

1. Запустить уже reviewed exact3 для последнего C3 run. По реальным причинам отказа
   довести592/593/598 до точных контактов и clearance. Не продлевать поиск вслепую: continuation
   требует отдельного конечного PLAN, новых actual endpoints и явного Adam restart, если moments не
   сохранены.
2. Повторить bounded synthetic BVH run с обновлёнными documentation pins, затем подготовить новый
   full-source PLAN и выполнить все377159 ledger rows через309820 строго сопоставленных запросов.
   Предыдущий full-source PLAN устарел и штатно отклоняется до Torch. Не обходить hash guard.
3. Закрыть source/bilateral world gates: обе руки, общая pose156, inactive hand, actual
   skin/pads/nails, keyboard и arm/body/inter-hand collisions. Exterior PASS сам по себе не даёт
   calibration.
4. Сделать independent review подготовленного native LEFT/C6 драйвера и только затем root GPU90+2
   diagnostic. По residuals отдельно готовить refinement. Закрыть C6 и весь inventory74; не
   объявлять finite-seed refusal анатомической невозможностью и не переносить cap proofs другой
   позы.
5. Реализовать строгий yaw writer в отдельную review-copy: reserved frames, full156 identity, GPU
   pre-LBS posed vertices, новые PAD/SIDE/nail seating, независимый saved Blender readback. Старый
   writer сохраняет atlas на месте и не подходит целиком. Текущие point-only NPZ недостаточны.
   Проверить все64 сохранённые позы: прежние60sentinels не заменяют этот список.
6. Экспортировать допущенные новые poses/transitions на том же52rig, добавить отсутствующие LEFT
   nails и доказать full exported surface. Реализовать prepare/press/hold/release/переходы и чистый
   sampler абсолютного времени PracticeSession; проверить pause/seek/replay и удерживаемые контакты.
7. Проверить результат в Blender и реальной игре сверху/сбоку, отдельно записать visual acceptance.
   После production изменений повторить pnpm check/spec:validate и обновить PR до готового
   состояния.

## Локальные точки продолжения

Все следующие пути относительно ignored `blender/labs/continuation-20261028/` нового worktree.
Модели, poses, NPZ, GLB, изображения и лабораторные скрипты остаются локальными; в Git их нет.
Worktree сохранён для продолжения, удалять его как завершённый нельзя.

| Артефакт                            | Путь / SHA                                                                                                                                                |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Общий локальный handoff             | `CONTINUE-RU.md`, актуальная пауза стоит в начале                                                                                                         |
| Полный closed kernel                | `semantic/caps-v14/SEALED-RESULT.json`; SHA `aabd5dd52ba7ce14e78e4d725897504038fec1b74da189c2b9d73d9b68819af7`                                            |
| Closed geometry                     | `semantic/caps-v14/right120-c+0-e0-s-55/construction/t-1of10/closed_geometry.npz`; SHA `26fb909b3bf80d1e4b63864c368899a5ead4eca058e668097036bd268d1f5e58` |
| Последний C3 numeric                | `c3-sdf-collision-v1/body-smoke-v2/runs/ff9f9a7f47b2/report.json`; SHA `e081537b4cde781f9a6c8a7a07999928b46c38d69fc08f1cc174e243eb05f68b`                 |
| Reviewed C3 exact PLAN, NOT_RUN     | `c3-sdf-collision-v1/body-smoke-v2/exact-v1/plans/330e73750dae/plan.json`; SHA `b48f7ff50ee5f2e5bad97369a5cc5f70b1455923995421cbf0db84193b153b85`         |
| Последний actual synthetic GPU PASS | `semantic/exterior-v3/runs/30660f988403/report.json`; SHA `8c2fc8971f67a31fe2cfe2a698ebf432e63981743cf1847cd18009c964517f34`                              |
| Новый synthetic PLAN, NOT_RUN       | `semantic/exterior-v3/plans/b5823cdd00d7/plan.json`; SHA `85663e30da672e39a4d3acd1152d8068b4825776cefb430a04d84379f45a86ab`                               |
| Старый full-source PLAN, STALE      | `semantic/exterior-v3/plans/full-source-7bc1479a85ef/plan.json`; SHA `012cd6b48a7cb86431d052c16452b0eb9c39b555797f3b4ae4776127b9095b24`                   |
| C6 PLAN, UNREVIEWED/NOT_RUN         | `native-left-c6-v1/plans/ee2b19f641d1/plan.json`; SHA `12c00b244a50a2f4060372dfda55ef7b940d77fdb4ffa99973216704e3ae12b3`                                  |
| C6 prep checkpoint                  | `native-left-c6-v1/PREPARED-CHECKPOINT-v1.json`; SHA `3485e8b49368fb1878cf32be5e5c400484d0b54925d6357549a77306954bf251`                                   |
| Writer design, без реализации       | `yaw-writer-v1/DESIGN-RU.md`                                                                                                                              |
| Полный static export631             | `surface-static-prototype/runs/static631-b487c2873962/`                                                                                                   |

Смена документации C6 затронула только два OpenSpec SHA старого BVH PLAN. Новый synthetic PLAN
сохраняет прежние13code/math pins и25cases; после нового authentic receipt нужно заново закрепить
full-source PLAN. Нельзя запускать старый полный план, выдавая прежний PASS за текущий.

## Проверки и сохранность

Production код после последнего полного `pnpm check` не менялся:4428tests +23compiler,10existing
skips, typecheck/lint/format/build PASS. Последующие изменения — спецификации и checkpoint docs.
Rig/loader33tests и independent review PASS. Последний полный spec:validate —81/81PASS; последующие
OpenSpec изменения также проходили strict validate. Старый duplicate1.7 warning принадлежит
game-visual-update, не этой задаче.

Основная папка/dev и пользовательский5190 не менялись. Все временные HTTP-стенды задачи остановлены.
Blender/MCP и старые сцены сохранены. Новых записей poses в atlas нет. Все собственные GPU-процессы
завершены; перечень PID/сессий и временных отказов находится в локальном session-ownership.json.
