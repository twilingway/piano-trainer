# Design

## Context

Этап 2a продолжает измеренный этап 1 (HEAD `63e964b`); решения Q1–Q5 утверждены пользователем. Ветка
`feat/game-visual-update`. Полный измеренный инвентарь, скрипты и машиночитаемые результаты —
`.scratch/inventory.md` и соседние файлы; `.scratch/` не коммитить. В этом документе сохранены
необходимые для ревью числа, чтобы проект не зависел от публикации частного scratch.

Пути брифа проверены. Atlas находится в
`E:/MySource/ReactJS/piano-trainer/blender/labs/mano-reference-20261018/black-key-atlas-20261018/keyboard88-20261019/`;
texture lab — в соседнем `hand-texture-20261019/`. Лаборатория READ-ONLY и продолжает меняться.
Сцена скопирована в worktree, размер/mtime до и после копирования совпали. SHA-256 atlas-копии:
`877f5023205f73f5789e800e8c7c8f3ff2c23336deea224f33e745badc83cf6d`, 250994531 B. Hand-skin-копия:
`72e9938f0d696bab07fdffe80a5bb2d7e64452dae4ca4796f543ba2f3ad7ebe2`, 3620292 B.

Найденный Blender: `C:/Program Files/Blender Foundation/Blender 5.2/blender.exe`, 5.2.2 LTS. Пробы
выполнялись фоновым Blender, CPU, два потока, без рендера и сохранения; длинные — через
`ops_run.py --name gvu-… --purpose … --kind blender`. Дальше использовать
`--factory-startup --disable-autoexec -b`, чтобы не загружать GUI/MCP-аддоны. Обращение CIM к
нагрузке ОС sandbox запретил; производительность машины этим исследованием не измерена.

### Измеренный атлас

В `.blend` записаны **1669** кадров: соответствующие corrective skin shape key, пять fitted nail
shape keys, quaternion keys 52 костей и положения 88 клавиш. `frame-index.json` содержит 1618 строк;
C4 794–844 восстанавливается из `smplh-black-key-atlas.json#/poses` с offset +793. Проверено
совпадение полного множества frame IDs с shape keys, а не только длина timeline.

Для этого инвентаря полные октавы C2–C6 = стартовые позиции C2–B6: **1215 кадров**, 243 на октаву (7
× 32 белых состояний + 19 чёрных на старте C). Их назначения могут заходить до F7, MIDI 36–101. Это
набор записанных пятипальцевых постановок, не все возможные аккорды диапазона.

| Стартовые позиции | Кадры     | Записано | GREEN | YELLOW | RED | Нет audit-файла | Отдельный r12 |
| ----------------- | --------- | -------: | ----: | -----: | --: | --------------: | ------------: |
| C2–B2             | 308–550   |      243 |   154 |     32 |  57 |               0 |             0 |
| C3–B3             | 551–793   |      243 |   198 |     27 |  18 |               0 |             0 |
| C4–B4             | 794–1036  |      243 |   111 |     19 |   2 |              60 |            51 |
| C5–B5             | 1037–1279 |      243 |    19 |      5 |  33 |             186 |             0 |
| C6–B6             | 1280–1522 |      243 |    27 |      8 |  95 |             113 |             0 |
| Всего             | 308–1522  |     1215 |   509 |     91 | 205 |             359 |            51 |

Это классы найденных `audit/frame-N.json`, не новый аудит snapshot. Всего в audit/ 1057 файлов, case
IDs совпали. Контрольный хеш списка файлов с их SHA-256:
`973681e001df24d918c435f72d35e4521becad3e2fed3996395edcd0092ce4c0`. Унаследованные C4: r12 index
даёт 47 PASS + 2 SOFT_PAD_PASS + 2 REJECTED; его `frame-status` помечает 49 «ГЕОМ ОК», 2
«ДОПУСТИМО». Их не выдаём за свежий keyboard88 audit. `predicted_class` в frame index устарел
относительно некоторых замен: например C2 прогнозирует 14 GREEN, фактические файлы — 154.
Prediction, audit и visual acceptance хранятся раздельно. Все записанные кадры, включая неизвестный
audit, входят в поставку по решению пользователя.

`assignment_midis[i]` — MIDI пальца `i+1` правой руки; `pressed_fingers` задаёт активный поднабор,
который обязан согласовываться с `pressed_midis`. `family/start/case_id/source_r12_frame` связывают
постановку с исходником. `blender_frame` — идентификатор записи, не время песни.

JSON-кандидат хранит `full_pose156` (52 axis-angle тройки), `right_hand_pose45`, ориентацию и
смещение запястья, body/lean и метрики. Сцена содержит более полное состояние: 208 quaternion
curves, предскиннинговую форму `v_posed`, armature, subdivision 2, GN PAD/SIDE и пять геометрий
ногтей. Candidates нельзя экспортировать вместо сцены: там нет всех поздних поправок.

В выбранных кадрах меняются 22 кости: Spine1/2/3, R_Collar/Shoulder/Elbow/Wrist и 15 правых
пальцевых суставов. Остальные 30 локальных вращений постоянны, включая левую руку. Root/skin
translation `(0.2078298628,-0.1285917461,0.7807747722)` м, scale=1. Поза относится ко всему телу;
левая кисть движется с позвоночником, но собственного левого нотного атласа **нет**.

### Геометрия и материалы

| Источник                    | Base vertices | Evaluated vertices | Evaluated triangles | Примечание                                  |
| --------------------------- | ------------: | -----------------: | ------------------: | ------------------------------------------- |
| 88 key-21…key-108           |          1696 |              20704 |               41056 | 52 белых, 36 чёрных; сумма экземпляров      |
| 8 частей корпуса            |           100 |                848 |                1664 | в том числе table.001 и панели до пола      |
| SMPLH Pilot Skin            |          6890 |             165314 |              330624 | 52 bones, subdivision 2, два материала      |
| 5 Pilot nail                |          7250 |               7250 |               14480 | по 1450 vertices, независимый refit на кадр |
| flat-hand в hand-skin.blend |           826 |              19641 |               39216 | только правая рука, UV skin, рига нет       |

Пять key meshes: `white-cut-right` 224/444 (vertices/triangles, 15 экземпляров), `white-cut-both`
288/572 (21), `white-cut-left` 224/444 (15), `white-full` 160/316 (1), `black` 216/428 (36).
Экспортировать evaluated объекты, а не скрытые нешлифованные templates. Корпус: `slip.001`,
`board.001`, `felt.001`, `table.001`, `cheek-left/right`, `panel-left/right`. Их суммарный bbox с
table: X −0.28625…1.12375, Y .190….560, Z 0….774 м. Bench/pedal — отдельные части сцены; новые
версии этих объектов этим изменением не запрошены.

В atlas **нет UV** ни у клавиш, ни у тела, ни у ногтей. Белые — `piano-white`, base linear RGB
(.86,.80,.66), roughness .36, Noise/ColorRamp; чёрные — `piano-black` (.010,.008,.007), roughness
.78 с процедурным bump; case (.018,.018,.024), roughness .28; felt (.30,.015,.025), .95; table
(.035,.030,.034), .45. Эти nodes обычный glTF export не переносит.

Текстура PR #199: `albedo-4096.png`, RGB 4096², **3667662 B**; `arm-uv.json`, 272229 B, 1977 SMPL-H
face→corner UV записей правой руки до локтя. В `hand-skin.blend` упакован PNG того же размера; это
не rigged whole-body модель. Левых UV/skin и новых normal/roughness maps нет. Часть тела вне правой
руки пока имеет нейтральные материалы, а не фотореалистичный full-body skin.

Текущие модели: `piano-kit.glb` 66888 B, 1706 glTF vertices /3192 triangles, без UV/images;
`hand.glb` 1736872 B, 27124/44248, 21 joint, три WebP 1024². `local-models/pianist.glb` 19977300 B,
49 joints, trial clip; `pianist-performance.glb` 32042160 B, 68 joints, SourcePerformance. Оба local
GLB содержат персональную head texture 4096², 9396913 B; их копирование в public не следует из
разрешения на SMPL-H тело. `local-performance.json` 387512 B, 1243 notes конкретного MIDI.

## Goals / Non-Goals

Цели и объём — в proposal. Архитектурная граница этапа 2a: только клавиши/корпус и вынужденные
адаптеры общей геометрии. Экспорт тела, rotations, mirror, selector/sampler и loader — этап 2b. Не
поставлять per-frame поверхности, GN residual, codec/replay chunks или большой morph atlas. Новых
production-зависимостей нет.

## Decisions

### 1. Экспорт keyboard88 и единые метры — 2a

`tools/hand-rig/export_keyboard88.py` открывает только копию `.scratch/atlas.blend`. Labs READ-ONLY;
фоновые команды используют Blender 5.2 `--factory-startup --disable-autoexec -b -t 2`, CPU. Команды
дольше примерно двух минут идут через
`ops_run.py --name gvu-<step> --purpose <по-русски> --kind blender -- <command>`. Никаких GUI/MCP,
GPU, сервера или браузера в 2a.

Выход `public/models/keyboard88.glb`: все actual `key-21`…`key-108` (52 белых, 36 чёрных) и восемь
case-объектов из инвентаря, включая `table.001`. Bench/pedal не входят в эти восемь. Использовать
evaluated bevel/normals, пять повторно используемых key shapes, исходные зазоры, CPU bake
процедурных albedo/roughness/normal материалов. UV0 сохраняет baked maps; отдельные координаты для
painted tops и стабильные top/body groups позволяют наклейки и emission без переделки формы.
Повторный запуск на том же снимке обязан дать **те же bytes и SHA-256**; исключить timestamps и
зависимость от порядка объектов. Зафиксировать source hashes, команды, MIDI, размеры, bounds/groups
и размер GLB в отчёте.

После просмотра 2a принята обрезка evaluated geometry только во время экспорта: `table.001` по
внешним X щёк (−0.22725…1.06475 м) и заднему Y `board.001` (0.485 м), `panel-left/right` только по
этому заднему Y. Границы вычисляются из evaluated вершин исходных щёк/board, затем плоскости
переносятся в локальные координаты меша. Bisect отсекает выступы и закрывает срезы плоскими гранями
до UV/triangulation; простой clamp деформировал бы фаски. Нижний край панелей остаётся на полу.
Вторым замечанием верх `board.001` срезается плоскостью Z=0.738 м (на 2 мм ниже белых клавиш, было
0.768), щёки — той же плоскостью (было 0.774), а `felt.001` (0.740…0.747) целиком опускается под ту
же высоту: иначе доска на 28 мм выше клавиш закрывала концы нот и огонь у линии удара. Третьим
замечанием весь корпус сзади срезается плоскостью Y=0.455 м, в 5 мм за задним краем клавиш: верх
доски глубиной 34 мм оставался тёмной полосой между нотами и клавишами. Остальные части сохраняют
форму. Лаборатория и `.scratch/atlas.blend` не перезаписываются.

Blender: X вдоль клавиш, Y от игрока, Z вверх, метры; C4 front/top=(.36,.30,.74). Преобразование в
игровую Y-up систему:

```text
world.x = c4WorldX + (blender.x - .36) * S
world.y = 22 + (blender.z - .74) * S
world.z = -(blender.y - .30) * S
```

`S` — **один** scalar по всем осям, например 1000 единиц/м. Его же в 2b использует пианист.
Конкретное C4WorldX вычисляется из song-range framing, а не из деформации пианино. Scene group
scale/pan после преобразования тоже единые. Для per-key local geometry якорь не вычитается дважды.
Старые `white.width/.0235`, `1000`, `142/.150` как три независимых scale запрещены в новом 3D пути.
В сцене всегда весь 88-key piano; песня меняет центр/масштаб камеры, а не ширину клавиш, длину
корпуса или вырезы на краях. Остальные key styles не меняются.

Pure metric mapping рядом с render владеет source→world, MIDI centres/bounds, UV overlay и
song-range framing. Камеры, key boxes, road note/contact row, hit line, key surface/picking и
эффекты читают этот контракт. Сохраняются независимые road/keyboard камеры, прямые/перспективные
ноты, resize, offset/pan, свободная камера и приоритет чёрной клавиши. Корпус не закрывает
фактический контактный ряд. Скрытое тело не влияет на geometry/framing.

Корпус непрозрачен и закрывал экранные эффекты, поэтому native renderer разделяет проходы:
фон/корпус → дорога → экранные fire/glow → восстановление depth корпуса без записи цвета →
клавиши/руки и прозрачные native эффекты. Ранее Pixi fire/glow рисовались до всего Three и
закрашивались новым непрозрачным корпусом. Callback между дорогой и восстановлением depth позволяет
сохранить видимость эффектов поверх корпуса и окклюзию руками; при переключении Pixi/Three
сбрасывается GPU state. Свободная камера сохраняет native эффекты с depthTest и не использует
экранные fire/glow. Так корпус не перекрашивает ноты, но закрывает руки и тело физически; blackout
остаётся последним. Членство объектов кешируется и обновляется при изменении сцены, а не через новые
коллекции на каждом rAF. Экспортная обрезка трёх деталей описана выше; в runtime геометрия не
меняется.

Каждая клавиша остаётся отдельным raycast-объектом. Ход — параллельная трансляция вниз `0.008*S` без
hinge; сглаживание ввода не меняет целевую глубину. Вынужденный адаптер прежних live hands должен
читать новую key surface/ход; его solver не переделывается. Не применять `blackKeyCap`/legacy UV
replacement к новой baked геометрии. Динамическая картинка только на верхах, baked ivory не умножать
повторно на тёмный idle tint. Appearance меняет свет/приглушение без удаления карт; emission
поддерживает top/body и переживает rebuild. Проверить sRGB/linear согласованность с текущим
renderer. `piano-kit.glb` сохраняется лишь при другом потребителе.

### 2. Одно skinned тело и экспорт костей — 2b

Замечание после просмотра 2b: в дорожных видах с раздельными камерами скрывается нижняя часть тела
от таза, включая стопы; свободная и performance-камеры сохраняют полную модель. GLB, атлас и
вращения не меняются. `keyboard88RoadBody.ts` один раз строит альтернативный индекс body primitive
по skin weights: pelvis и обе цепи Hip/Knee/Ankle/Foot определяют нижнюю область; треугольник
исключается, если хотя бы у одной вершины суммарный вес этой области ≥0.5. Это скрывает также
переходные грани у таза без изменения длины костей и без дополнительного skinned mesh. Shell
передаёт фактический признак раздельных камер из ThreeStage; view переключает кешированную геометрию
и восстанавливает исходную при общей камере/dispose. Вычислений индекса на rAF нет.

Проверка проходов: публичный пианист — потомок keys и рисуется только в последнем проходе камерой
клавиатуры, после depth корпуса; road-camera его не рисует. В «Сверху» ортографическая камера не
уменьшает стопы из-за их высоты под клавишами; стопа шириной около 94 мм занимает четыре шага 23.5
мм. После очистки depth дороги нижняя часть модели могла проецироваться поверх дороги за укороченным
корпусом. Сэмплирование перед рендером тоже получает физическую камеру клавиатуры.

Другой найденный механизм полосы — экранный placement: ранее keys.offset применялся только в
проекции клавиатуры, а дорога и эффекты сохраняли прежний контакт. Сдвиг вниз на 130 px создаёт
зазор ровно 130 px при любой ширине; собственная геометрия key-back/near совпадает на 150 мм, корпус
заканчивается на 155 мм. `nativeNoteCameras` калибрует notes и blackLane по уже смещённой проекции
клавиатуры; Three применяет offset к клавиатуре ровно один раз. RoadLayer обновляет контакт, hit
line, туман и проекцию для smoke/fire anchors при изменении placement, сохраняя исходный
keyboardCamera. Legacy и computer views сохраняют прежнее отделение клавиш. Фактическое сохранённое
placement показанного пользователем кадра без браузера не проверено; это проверяемый механизм
разрыва, а не подтверждение состояния того кадра.

`export_keyboard88_performer.py` строит один GLB из **base 6890 vertices SMPL-H skin**, 52 костей с
rest transforms/weights. Допускается один subdivision в rest pose с интерполированными skin weights,
если GLB остаётся ≤15 MiB; subdivision на кадр отсутствует. Ногти используются **только нарисованные
в текстуре руки**. Пять `Pilot nail 1–5` — вспомогательные объекты для постановки в Blender: не
экспортировать их геометрию, shape keys и привязки; в игре нет отдельных nail meshes. Корректирующие
формы, subdivision 2 и GN PAD/SIDE из инвентаря описывают источник, но в runtime не воспроизводятся.

Все 1215 **записанных** кадров 308–1522 экспортировать из Blender armature, не из устаревших
candidate JSON. Данные: локальные quaternions 52 костей, плюс root transform только если меняется;
frame IDs, assignment, pressed mask, provenance и audit metadata. Общий бюджет **всех** pose data,
включая индекс/метаданные, ≤2 MiB. Float32 rotations до упаковки измерены: 1010880 B, DEFLATE 219885
B. Одного небольшого пакета достаточно: не нужны codec worker, surface cache/LRU или большие chunks.
Валидировать числа, размеры, IDs, bone order, quaternions и version до применения.

Экспортная проверка на **всех 1215 кадрах** сравнивает позиции стабильных fingertip anchors
(соответствующие bone heads/tails) в three.js из экспортированных rotations/rest transforms со
снимком **Blender armature**, в исходных метрах; max error ≤0.5 мм. Проверка исходной правой позы
проходит до усреднения торса и коррекции левой руки. Это не сравнение GN-поверхности: отсутствие
уплощения подушечек и субмиллиметровое проникновение приняты. Не добавлять gaze/head/foot motion
поверх sampler. RED/YELLOW/unknown доступны на равных, статус не переименовывается в PASS.

Правые UV из `arm-uv.json` переносить по стабильным SMPL-H face/corner IDs. Albedo — **lossless
WebP**, ориентир 2318576 B (≈2.21 MiB; бюджет около 2.3 MiB); сверить decoded pixels с PNG.
Исследовать реальную SMPL-H left/right vertex или face correspondence и доказать её по IDs/
topology; при наличии зеркалить правую hand texture на левую. Если соответствия нет — matched flat
skin material слева с явным отчётом, без угадывания UV. Источник: лаборатория
`hand-texture-20261019/`, `README-RU.md`, `bake/albedo-4096.png`, `arm-uv.json` с исходными SMPL-H
face IDs; `flat-hand` вырезан из того же тела. UV относятся ко всей правой руке до локтя, а не
только кисти. Остальное тело получает простой материал, похожий на одежду; качественный материал
лица будет отдельной работой. Личные local pianist GLB/face maps не копируются.

### 3. Изолированный mirror и общий торс — 2b

Замер lead `.scratch/pelvis-x.json`, `.scratch/pelvis_x.py`: pelvis **x=.2100 м** во всех 1215
кадрах. Key-N = MIDI N. C3=.1955, D3=.2190, C4=.3600 м; white step=.0235 м. Клавиатура зеркально
симметрична относительно каждой D и G#. Ближайшая ось — D3 MIDI50: 9 мм справа от pelvis; G#2 — 73
мм слева, G#3 — 91 мм справа.

Для left key k брать mirrored right frame для key **100-k**, геометрическое отражение
`x'=2*.2190-x=.4380-x`. Например left C2 MIDI36 берётся из right E4 MIDI64. Правые назначения
покрывают MIDI36–101; зеркальные назначения математически −1…64, а физическое игровое покрытие слева
— **MIDI21–64**, пересечение с 88 клавишами. Ни один исходный frame из-за этого не удаляется; вне
покрытия работает nearest selection.

Отражение локальных bone rotations относительно body plane .2100 даёт `.4200-x`, на 18 мм левее
нужного. Корректировать только левый arm chain к цели **+0.018 м X**, например аналитическим
two-bone shoulder/elbow решением без растяжки и с сохранением wrist/finger rotations. Не сдвигать
pelvis/whole body. Mirror/arm correction — отдельный заменяемый адаптер для будущего left atlas.
Отчёт по всем mirrored frames: residual fingertip-to-key error до/ после, максимум/распределение,
достижимость, физические keys отдельно от целей вне keyboard. Не выдавать bone export tolerance 0.5
мм за заранее доказанный left residual.

Pelvis/spine/neck/head берут hemisphere-corrected slerp-average right frame и mirrored left frame с
alpha=.5; collar→fingers каждой стороны — собственный frame. Root сохраняет общий исходный
transform. Усреднение торса может менять contact относительно одиночного right frame; это принятое
производное состояние, его residual также измеряется, а не называется исходной Blender-поверхностью.

### 4. Чистый ближайший selector — 2b

`keyboard88Atlas.ts`, `keyboard88Plan.ts`, `keyboard88Sample.ts` — небольшие pure TS модули без
Three/DOM/React/fetch/timers. Shell загружает, view применяет численные состояния. Вход — штатные
immutable notes hand/MIDI/finger/start/end и song time из `PracticeSession`. Адаптер штатных
`FingeredNote` без ID использует стабильный ordinal исходного массива как ID; end=start+duration.
План группирует одинаковые timestamps, release до onset, стабильный порядок hand/MIDI/finger/ note
ID. Held notes по note ID/счётчику сохраняются при перекрытиях.

При exact mismatch, растяжке, crossing, неполном finger set, чёрной клавише вне families или нотах
вне покрытия **всегда выбрать ближайший кадр**, не скрывать/останавливать руку. Ранжирование
lexicographic:

1. Совпадение множества нажатых пальцев предпочтительнее несовпадения.
2. Минимальная сумма `abs(requested MIDI - candidate assignment MIDI)` по всем запрошенным нажатым
   пальцам/нотам; assignment содержит все пять пальцев даже при другой pressed mask.
3. Точное равенство предыдущему полному назначению пальцев из хронологического pure plan.
4. Меньший исходный frame ID.

Нота без finger получает ближайший finger по key: для candidate assignment минимальная
MIDI-разность, при равенстве меньший finger number. Это визуальное назначение не пишет finger в
песню и не влияет на score/оценку. Конфликт двух нот одного finger учитывает обе разности; nearest
кадр всё равно выбирается, diagnostic отличает приближение от exact. Первый event без seed
разрешается меньшим ID после первых двух критериев. Audit не участвует в ranking. Предыдущее
назначение никогда не берётся из последнего нарисованного кадра: seek-safe план строится
детерминированно от начала. Left ranking использует reflected MIDI в left-space.

### 5. Переходы по song time — 2b

**Допущение lead Q3, принятое для реализации:** slerp local bone rotations между последовательно
выбранными кадрами. Press достигает целевого состояния **точно в onset**; начало движения
`max(previous event time, onset - .080)` секунд. Root при изменении интерполируется согласованно.
Самплер random-access, принимает только plan/time, без delta clock.

Когда ничего не удерживается, release возвращает к **mask 0 того же assignment/позиции**. У 10 из 55
записанных assignment (mixedA/thumbblack каждой октавы) mask0 отсутствует. Для них действует общая
политика nearest: среди записанных mask0 минимизировать L1 по всем пяти MIDI предыдущего assignment,
затем меньший frame ID; новые source poses не синтезировать. Техническая конкретизация допущения Q3:
release-переход начинается в release time, длится до 80 мс и обрезается началом подготовки
следующего onset; при совпадении границ target onset имеет приоритет. Нулевая длительность означает
целевой endpoint без деления на ноль. До первого event — mask0 выбранной первой позиции; пустая
песня — стабильный rest кадр с минимальным ID. Два касающихся release/onset сохраняются в плане
отдельными событиями; выдуманная музыкальная пауза не вставляется. Промежуточные slerp-позы не
объявляются collision-safe или точными удержаниями Blender. Pause/seek/speed/повтор одного времени
дают тот же результат.

### 6. Ленивый public loader и интеграция — 2b

Public loader включается только для native 3D + выбранных 3D-рук; geometry keyboard88 нужна для
3D-клавиш независимо от рук. Manifest/body/skin/≤2 MiB rotations могут быть одним малым набором:
музыку не ждать. При pending/missing/corrupt/version/hash/count error работает прежний live
`hand.glb`; никогда не показывать две пары. На готовность выбирать актуальное song time, не
проигрывать накопленные переходы. Generation/abort защищают от stale song loads, dispose освобождает
только свои ресурсы, shared maps — однократно. Настройки/localStorage не сбрасывать.

Body off оставляет hands-only той же модели; hands off скрывает выбранные руки и сохраняет
preference. Manifest masks по исходным IDs разделяют body/hand без двойной геометрии; nail mask
пуст, отдельных ногтей нет. Разделение выполняется без regex-угадывания. Public path не зависит от
DEV, performance ID или source MIDI SHA. **DEV-only `local-models/` path остаётся нетронутым**, его
существующие режимы не подменяются автоматически наличием public файла. При public atlas выбран один
владелец рук.

## Risks / Trade-offs

- LBS не повторяет corrective/PAD/SIDE и per-frame nails → принятая fidelity, отдельные bone/
  surface/contact отчёты; не возвращаться к 100 MiB поверхности.
- Mirror/18мм correction/torso average могут ухудшить contact → полный residual report и
  изолированный заменяемый left adapter; не растягивать кости.
- Межкадровый slerp допускает пересечения → явно производные transitions, visual acceptance в 2b.
- Потеря procedural look и overlay UV при export → CPU bake, byte-identical rerun, группы/UV тесты.
- Узкий song range на full88 может обрезать корпус кадром → камера обрамляет песню, geometry не
  обрезается и не растягивается; проверить полное пианино свободной камерой позже.
- Бюджеты модели/поз проверяются по фактическим файлам → GLB ≤15 MiB, pose/index суммарно ≤2 MiB,
  lossless skin около 2.3 MiB. При превышении оптимизировать rest mesh/сериализацию, не исключать
  кадры и не вводить поверхности на кадр. OSMD и XML не затрагиваются; на rAF нет перебора всех
  кадров, нового музыкального clock или React App rerender на каждую позу.

## Пересечения и порядок интеграции

`world-camera` пересекается с `three-piano-road-renderer`: сохранить раздельные камеры,
проекции/контакты/depth. `hand-styles` 42 PNG остаются для остальных видов. `live-hands`
collision/timing относятся к прежнему solver, не к атласу. `pianist-black-key-atlas` и
`pianist-right-hand-*` сохраняют историю local/licence/audit, новое публичное решение — proposal.
`local-pianist`/private performance и `local-models/` этим change не переписываются. `pianist-intro`
additive motion не накладывать на новый public sampler. Существующие bench/ free-camera/depth
настройки сохраняются. Старые changes не закрывать и не архивировать здесь; lead согласует
пересекающиеся deltas при последующей интеграции.

## Migration / Rollback

2a: обновлённые specs validate → keyboard export → metric adapter и unit tests → проверки. 2b:
freeze обновлённого источника → body/skin + rotations/bone fidelity → mirror residual →
selector/sampler → loader/visibility → browser/network acceptance. Результат 2a остаётся принятым
пользователем и закоммиченным в ветке. Реализация 2b остаётся незакоммиченной по брифу; численные
результаты и существенный contact residual описаны в `docs/KEYBOARD88_ASSETS.md`. В стандартном
Three LBS используются четыре крупнейших нормализованных веса: max discarded mass0.5617%,
mean0.00318%; это измеренное приближение поверхности. При ошибке 3D сохраняется штатный fallback
«Перспектива»; hand.glb нужен для loading/failure. Не удалять piano-kit до проверки остальных
потребителей. Выпуск/merge/archive не входят в это поручение.

## Validation

2a: два byte-identical background exports; unit tests transform/MIDI/UV/groups/framing/emission;
`pnpm spec:validate`, `pnpm exec prettier --check openspec/changes/game-visual-update`, `pnpm lint`,
`pnpm typecheck`, `pnpm build`. Vitest: `pnpm exec vitest run --pool=threads <files>`; при spawn
EPERM сообщить точную ошибку lead, не менять config. Браузер/сервер в этом запуске запрещены;
визуальная приёмка остаётся lead.

2b: 1215 bone-tip comparisons ≤0.5 мм, весь исходный набор/audit, left residual/torso metrics,
lossless pixel equivalence, budgets, pure deterministic selection и random-access times, loader
failure/stale/dispose. Затем видимый Chrome/Edge: idle/press/release белых/чёрных,
наклейки/emission, раздельные камеры, narrow/full range/resize, pause/seek/repeat, body/hands
toggles, loading/failure и network. Численный PASS не заменяет визуальное сравнение с Blender.
Synthetic input не выдаётся за hardware MIDI или аудиоприёмку.
