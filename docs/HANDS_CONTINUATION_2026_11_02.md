# Продолжение работы над руками, 2 ноября 2026

Статус: работа продолжается. Основная папка остаётся на dev; изменения этого этапа готовятся в ветке
`feat/pianist-hands-resume-20261102`. Приватные модели, сцены, позы и отчёты остаются в сохранённых
локальных лабораториях и в Git не добавляются.

## Порядок

1. Закрыть контакты и коллизии трёх оставшихся C3: 592, 593, 598.
2. Подтвердить нативную левую руку и единый корпус для обеих рук.
3. Проверить удержания и переходы на небольшом принятом диапазоне.
4. Добавить октавы и другие растяжки, затем расширять покрытие по музыкальным случаям.

Массовая доводка всего старого атласа до зелёного не является prerequisite растяжек. Полный
физический допуск рабочего набора, сохранение Blender, экспорт и визуальная проверка обязательны.

## Полученные результаты

### C3

Новый точный RH-аудит завершён для всех трёх последних SDF-кандидатов. Все три остаются RED:
контакты неполные, есть нарушения skin/key clearance. У 592 и 598 найдены также неразрешённые
пересечения. Совпадение numerical/full-model/serialized poses проверено; это отказ геометрии, а не
ошибка переноса позы. Новых записей в атлас и новых зелёных поз нет.

Продолжать эти endpoints прежним weighted-sum поиском нельзя: снижение ошибки контакта
сопровождалось ухудшением геометрии. Следующий ограниченный поиск начинается с прежнего
геометрически чистого endpoint 593; каждое предложение проверяется неизменным exact RH judge до
принятия. Отдельный finite PLAN, отрицательные тесты и независимое review предшествуют GPU.

Дополнительный constrained593-v2 фактически выполнен. После исправления передачи измеренной parity в
unchanged exact entry принят один малый шаг: targets 55.334075 → 55.078923. На следующей итерации
все шесть scales отклонены; выполнен точный rollback и `NO_FEASIBLE_STEP`. Ногти не получили новых
проникновений, skin/key audit не выдал новых причин отказа; максимальная vertex clearance violation
0.000350 мм остаётся внутри прежнего порога аудитора. Контакты 1–4 ещё не закрыты, палец 5 сохранил
допустимый gap. Более крупные шаги отвергаются, а не принимаются ради снижения loss. Следующая
отдельная family исследует локальные направления пальцев.

Блочный поиск C3/592 и 593 выполнен с фиксированными кистью, корпусом, FREE и удерживаемыми
пальцами. Приняты 4 локальных блока для 592 и 2 для 593 без ухудшения проверяемых компонентов. У 592
появился измеримый thumb gap 3.569292 мм; у 593 gap пальца 2 уменьшен до 1.436424 мм. Контакты ещё
не в допуске, у 592 палец 3 остаётся без plateau sample. Новых принятых поз в атласе нет.

Отдельный restoration598-v1 завершён с `NO_FEASIBLE_RESTORATION_STEP`: все шесть scales отклонены,
получен проверенный rollback. Даже минимальный шаг улучшал vertex/triangle clearance, но ухудшал
проникновение ногтя 2; такое улучшение не принимается за счёт другого компонента. Контакты 2/3 и
исходная поза сохранены. Следующая restoration family требует другого направления, не меньшего
порога или отключения nail gate.

### Левая рука

Первый запуск v1 остановился до первого результата из-за CPU/CUDA device mismatch в выборе
subdivision-матрицы. Он сохранён как отказ. Отдельная v2 исправляет только локальный device context
и проверяет device/FP64 без преобразования коэффициентов; 17 pure/static тестов и независимое review
прошли.

Фактически выполнены все 92 диагностических случая v2: исходная baseline, отдельная C4 baseline и 90
seeds. В семье C4 33 из 45 вариантов получили raw pad/plateau gap в прежнем интервале, 12 отклонены
по reach; отдельная C4 baseline также получила raw contact. Все 45 C6 seeds отклонены по reach. Это
конечный результат выбранной семьи при фиксированных условиях, не доказательство анатомической
невозможности C6 и не закрытие inventory74.

Ногти, GN/SIDE, точная полная поверхность, world/bilateral, saved Blender и visual остаются
непроверенными. Зелёные физически допущенные LEFT-позы этим прогоном не получены.

Затем выполнены 405 initial reach screens: 135 контекстов корпуса × 3 прежних thumb anchors.
Достижимых вариантов C6 в этой сетке нет; лучший вариант при yaw −40°, lean 25°, protraction 30°,
elevation 25° требует 0.548064 м при strict maximum 0.521952 м: нехватка 26.113 мм. Все отказы
сохранили численные witnesses; pelvis, rest lengths, FREE/RIGHT и source identity проверены. Этот
результат не распространяется на другие допустимые формы активного большого пальца и ориентации
кисти. Новая ограниченная family готовится отдельно; за пределы fitting bounds не выходит.

В actual v4 разгибание thumb и плоские ориентации сократили лучший reach excess до 3.884 мм. После
этого actual v5 проверил четыре явно заданных наклона кисти: 3 initial reach survivors, 19 полных
диагностических строк. Получены **5 raw C6 contacts** с gap 0.250625–0.279926 мм и 325–340
preferred-pad samples; 4 других C6 варианта отклонены после PSD/reach обновлений. Все 9 matched C4
controls получили raw contact. Это доказательство предварительного контакта на модели; полный
key/skin/triangle, inactive RIGHT, LEFT nails, containment и saved Blender ещё не дают физического
допуска. Key-only raw diagnostic выделен в design/tasks2.1.7 и отдельный scenario, strict OpenSpec
validation прошёл до реализации нового helper.

### Геометрический prerequisite

Обновлённый synthetic BVH-прогон прошёл 25 случаев и проверку шести ledger mappings. Создан
отдельный полный план по всем 377159 строкам и 309820 unique queries с прежними source/ROW/face
arrays. Новый адаптер отличается от прежнего только тремя привязками к свежему synthetic proof;
старые код, планы и receipts не менялись. Полный actual-source запуск завершён: все четыре target
набора получили OUTSIDE_CERTIFIED без UNRESOLVED. Независимый `read_committed(..., expand)`
подтвердил все шесть ledgers, 377159 строк, публикацию и SHA. Это computational exterior proof
закреплённого source, а не physical/saved/export/visual допуск позы. Отчёт:
`semantic/exterior-v3/runs/actual-full-source-ff898810d6d9/report.json`, SHA
`30f896895aee1117de5d5cbec48a5465b6baf65a3aff3a210f4312fa10ac3c7f`.

## Приёмка и ограничения

Открытый Blender проверен через MCP: сохранённая review-copy, кадр 631, dirty=false. Исходные 64
исправленные позы и замороженный C4 сохранены. Пользовательский сервер 5190 не меняется. Недельный
предел теперь 89% USED (11% остатка); перед этапами и во время GPU действует guard, один job,
CPU0–5/below-normal и общий cap 12 GiB VRAM.

`physical_class=null`, `calibration=null`, `eligible_for_write=false`. Численная диагностика не
заменяет общий допуск, экспорт, анимацию или пользовательскую визуальную приёмку.

## Источники продолжения

- [Общий план](../openspec/changes/verified-pianist-runtime/tasks.md).
- [Исторический checkpoint](../openspec/changes/verified-pianist-runtime/resume-checkpoint.md).
- Локальная лаборатория: `pt-agents/keyboard88-hands-runtime/blender/labs/continuation-20261028/`.
- C3 exact: `c3-sdf-collision-v1/body-smoke-v2/exact-v1/runs/15cc3aa29612/report.json`.
- LEFT v2: `native-left-c6-v2/runs/05269cc3d5f3/report.json`.
- Полный BVH PLAN: `semantic/exterior-v3/plans/full-source-ff898810d6d9/plan.json`.

Проверки ветки: `pnpm check` PASS (4478 tests, compiler 30, 10 existing skipped);
`pnpm spec:validate` 86/86. Черновик [PR #274](https://github.com/twilingway/piano-trainer/pull/274)
открыт в dev; задача и физическая приёмка остаются незавершёнными.

### Полный raw key-only прогон LEFT/RIGHT

Новый helper v2 прошёл 17 CPU synthetic/metadata тестов и независимое review. Точный preferred411,
полные vertex/triangle partitions, separating AABB witnesses и atomic publication проверены
отрицательными тестами. Actual GPU-прогон по 15 сохранённым surfaces завершён; независимый
`publication.read` подтвердил committed SHA, source bindings и coverage без инициализации CUDA.

Результат: literal baseline проходит LEFT/RIGHT key predicates; все 14 рабочих контактов valid, но
LEFT key predicates отклонены. Inactive RIGHT проходит key predicates во всех 15 случаях. C6
задевает соседние белые B5/MIDI83 и D6/MIDI86; C4 в той же экстремальной постановке — B3/MIDI59 и
D4/MIDI62. Основные worst ROW входят в thumb411; данных для изменения FREE пальцев нет. Лучший C6 по
max vertex/sample violation имеет 2.711 мм и 82 unauthorized crossings.

Это отказы сохранённых raw surfaces, не допуск corrected/GN/SIDE/nail/world/saved/export/visual.
Общий class/calibration остаётся null, writer запрещён. Следующая узкая диагностика проверяет три
уже сохранённых нейтральных C4 из actual LEFTv2 и baseline, без новой модели или оптимизации.

Отчёт: `native-left-key-diagnostic-v2/runs/4cf5aa5c91c5/report.json`, SHA
`76c3bdfb39bb85ab134bf43bb8ab110b4c798af6a51cd23cdb6245c7b5ab2da1`. Pinned OpenSpec-файлы этой
рабочей папки сохраняются неизменными как источники proof; обновления статуса пишутся здесь. Их
нельзя удалять или обновлять вместе с worktree без отдельного переноса immutable provenance.
Локальная отметка сохранена в ignored `.browser-artifacts/proof-sources.json`.

## Остановка на недельном пределе

2 ноября 2026 достигнут установленный пользователем предел 60% недельного расхода; свежий live read
подтвердил 60%. Новые задачи и GPU-прогоны остановлены. Собственных GPU/Python jobs и web-серверов
не осталось; пользовательские Blender и 5190 не изменялись.

Key-only v3 для трёх сохранённых нейтральных C4 плюс baseline сохранён локально; 20 CPU tests
прошли. Predicate/pruning/publication math скопирован без изменения из проверенного v2. Immutable
prepare, окончательная сверка SHA, независимое review и actual GPU v3 не выполнялись из-за STOP60.
Checkpoint: `native-left-key-diagnostic-v3/STOP-60-CHECKPOINT.json`.

После явного продолжения и свежего weekly ниже 60%: сверить сохранённые inputs/code bytes,
подготовить immutable v3 PLAN, провести независимое review и один managed GPU-прогон. Затем выбирать
correction family по полному key-report, не расширять разрешения на соседние клавиши. C3 остаётся
незавершённым; новых поз в атлас не записано. Удержания, экспорт, игровая анимация, октавы и
растяжки ещё не закрыты. Черновик PR остаётся открытым, слияния и deployment не было.

## Продолжение после нового разрешения

Пользователь явно заменил прежний предел: сохраняем **11% недельного остатка**, останавливаемся при
**89% USED**. STOP60 выше — историческая остановка. Новый guard проверен независимо: свежесть live
snapshot, отказ при устаревшем или неверном источнике, отдельное обновление quota без блокировки
VRAM watchdog. Один GPU child, CPU0–5/below-normal и cap12 GiB сохранены. Свежий live read
2026-11-02 12:45 UTC: 61% USED.

Key-only v3 завершён после immutable prepare (564 pins), 20 CPU tests и независимого review.
Committed reader проверил четыре строки без инициализации CUDA. Literal baseline проходит обе руки.
Нейтральные LEFT A/B проходят key predicates левой руки, C отклонён. Inactive RIGHT отклонён во всех
трёх рабочих вариантах: общий корпус опустил правое запястье на 66.818 мм; основное проникновение
дают поверхности безымянного пальца правой руки на покоящиеся клавиши. Это основание для отдельного
восстановления RIGHT17/19/21 при фиксированных корпусе, LEFT и пальцах RIGHT, с повторной проверкой
обеих полных поверхностей.

Отчёт v3: `native-left-key-diagnostic-v3/runs/a79d26e4809b/report.json`, SHA
`7f5fbc5fbc667b946dbf533e9081938c02c25227d9f3bb40c77e65d90e186daf`.

Продолжение C3 использует точные текущие final_exact предыдущего finger-blocks report: только ранее
продуктивные блоки 593/f2 и 592/f1,f3; максимум 8 проходов, бюджеты48/96. Все 494 pins и 13 CPU
tests прошли независимую проверку. Запущен один managed GPU-прогон с новым quota89 guard. Физический
допуск, запись в Blender и пополнение зелёных поз этим не заявлены.

### Результат ограниченного продолжения C3

Managed run завершён exit0 за 248 с, global VRAM peak5620 MiB. Кадр593 принял4 дополнительных блока
и остановился PASS_NO_ACCEPTANCE (21 из48 trials); gap пальца2 уменьшен до1.357691 мм, контакты1–4
всё ещё невалидны. Кадр592 принял10 блоков за8 проходов (69 из96 trials): gap большого пальца
уменьшен с3.569292 до1.101414 мм, средний пока не получил actual plateau samples. Удерживаемый5
сохранён:0.402887 мм у593 и0.340978 мм у592. Все три C3 остаются незавершёнными; новых зелёных поз
нет.

Отчёт: `c3-finger-blocks-continuation-v1/runs/956aaea4db94/report.json`, SHA
`2258ea31324749409bd1379f97ccc1bf57e2d17c9130b5e5dc9ab9990e5da151`. Следующий шаг определяется
фактическими guard-отказами сохранённых trials. Отдельный независимо проверенный sweep598 запущен
после полного завершения этого GPU job.

### Sweep598 и причины дальнейшей работы C3

Все24 независимых физических coordinate probes598 завершены (managed exit0, peak5950 MiB). Выбран
MCP−0.000625 рад: nail2 penetration1.508481→1.500970 мм, vertex violation0.266564→0.254958 мм,
triangle sample violation0.602990→0.591121 мм. Контакты2/3 сохранены, но gap2 уже0.987811 мм;
поэтому дальнейшее односуставное поднятие не является решением. Отчёт:
`c3-restoration598-coordinate-v1/runs/2afab873f1ea/report.json`, SHA
`bb2fbb3df8bc106f5f9f71043b3041fe1918cf8631d60e1006ebe33d2f6793f0`.

Независимый разбор C3 различил два барьера. В593 уменьшение contact objective ухудшает max vertex
clearance component. В592 после полученного plateau исходный acquisition objective снижается, но
actual pad gap растёт. Следующая новая bounded family должна использовать проверенный actual-gap
witness для592 и согласованные суставные изменения с неизменными component/nail/held gates
для593/598. Простое увеличение старого числа проходов не планируется. Все физические классы остаются
null, writer выключен.

### Общая поза: восстановление RIGHT и новый двусторонний key-аудит

Генератор изменил только RIGHT17/19/21 у двух нейтральных LEFT A/B × swivel−20/0/+20; сохранены
корпус, collar14, все LEFT local rotations, пальцы RIGHT, legs/rest/betas. Fresh strict reach,
native RIGHT orientation, raw156/matrix/full-PSD parity и source rebuild guards прошли. Независимый
typed reader подтвердил все7 surfaces и576 pins. Отчёт:
`shared-right-standby-v1/generation-runs/38e05e6c0b7b/report.json`, SHA
`9d9ad8329cd8ca1f97abed975c17400a0ee00ebe09fbb396c9b162fe5b996091`.

Повторный key-only план закрепил593 pins и прошёл отдельное review. Actual GPU-прогон завершён
exit0; независимый `publication.read` без Torch подтвердил все7 строк. **Все6 рабочих поз проходят
fresh LEFT contact и full LEFT/RIGHT key predicates**, baseline тоже проходит обе руки. Fresh
working gap находится в−0.1167…+0.3621мм и валиден по закреплённой contact policy. LEFT skin
изменилась на0.439–1.255мм из-за global PSD, поэтому прежний LEFT PASS не наследовался. Отчёт:
`shared-right-standby-v1/runs/82ff7c742b4b/report.json`, SHA
`f32e5794ac7a21552765d6d613a939041d0196ef710e35e79abf271b23a97a5e`.

Это ещё не физически зелёные позы. Следующий bounded rejector проверит полные LEFT×RIGHT triangle
pairs. Native LEFT finger memberships и ногти пока отсутствуют; RIGHT-specific Nails/ArmClearance не
переносятся переименованием. Для воспроизводимой сцены нужен stagewise pre-LBS producer и отдельный
diagnostic roundtrip writer. Повторный read-only MCP подтвердил исходную review-copy, кадр631,
dirty=false; сцена не изменена.

### Полный raw interhand rejector и новый C3 witness-прогон

Отдельный pair-план прошёл12 synthetic CPU tests и независимое review620 pins. Actual GPU-прогон
завершён exit0 за84с; независимый typed reader подтвердил отчёт. Literal baseline не имеет найденных
noncoplanar surface intersections. Все6 рабочих поз отклонены: A swivel−20/0/+20 —994/981/953
triangle pairs, B —1113/1083/1068. LEFT pad/411 в этих hits не участвуют; справа затронуты
преимущественно fingers3–5 и nonpad surface. Это не основание менять LEFT FREE пальцы. Отчёт:
`shared-hand-pair-v1/runs/529e4ba11181/report.json`, SHA
`4d1bc278f7d77fbf5f434e148741ce1a1a89081e1b00e5d180fb69ae37c771c8`. Coplanar остаётся NOT_COVERED,
containment NOT_RUN. Следующая отдельная family поднимет неактивное RIGHT wrist на60мм при тех же
A/B и трёх swivel; это лишь предварительный forecast, без переноса прежних key/contact/pair
результатов.

Новый C3 witness-план после исправления обработки потерянного контакта прошёл24 CPU tests и
повторное review518 pins. Actual GPU exit0,26 actual audits из максимальных40. В592 выбран
gap-scale¼: **большой палец получил valid actual gap0.991684мм**, held5 сохранён0.340977мм; средний
по-прежнему без plateau. В593 нет хорошо обусловленного stable-witness направления, все projected
slots явно пропущены. В598 coupled slots отклонены по companion cap; обе позы точно возвращены к
своим текущим baseline. Отчёт: `c3-witness-directions-v1/runs/73279606b208/report.json`, SHA
`8a45702fe9703b0e6faacfa9f3e7bcb402099647c586eca33d271eeb40c60a89`. Ни одна полная C3-поза ещё не
получила физический допуск.

Producer literal631 v1 остановился до экспорта геометрии на model-array hash guard. Read-only разбор
установил несовпадение hash recipes: source включает shape/dtype, v1 сравнивал только bytes. Model
paths/file SHA совпали. Исправление подготовлено исключительно в новой v2, ожидаемые source hashes и
v1 сохранены; требуется новое review и actual run. Blender-часть пока не запускалась.
