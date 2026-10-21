# Keyboard88: клавиши и корпус, этап 2a

Клавиатура находится в `public/models/keyboard88.glb`; публичное тело, атлас вращений и runtime
этапа 2b описаны ниже. Принятые решения — `openspec/changes/game-visual-update/`.

## Источник и воспроизводимость

Blender 5.2.2 LTS (`d13f752e3b9c`), только background CPU, два потока. Открывается **копия**
`.scratch/atlas.blend`, исходная лаборатория только читается и не сохраняется. SHA-256 копии:

```text
877f5023205f73f5789e800e8c7c8f3ff2c23336deea224f33e745badc83cf6d
```

Команда из корня worktree, PowerShell:

```powershell
python C:/Users/AlekseiHome/dev-settings/claude/mods/ops-hud/bin/ops_run.py --name gvu-keyboard-export --purpose "Экспорт клавиш и корпуса keyboard88 с запечёнными материалами" --kind blender -- "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" --factory-startup --disable-autoexec -b -t 2 --python-exit-code 1 --python tools/hand-rig/export_keyboard88.py -- --source .scratch/atlas.blend --output public/models/keyboard88.glb --report .scratch/keyboard88-export.json
```

Экспортёр проверяет, что входной `.blend` находится в `.scratch/` этого worktree. Источник не
перезаписывается. Повторить команду для того же снимка и сравнить SHA всего файла:

```powershell
Get-FileHash -Algorithm SHA256 public/models/keyboard88.glb
```

После обрезки корпуса два независимых полных запуска дали одинаковые **570008 байт**, 0.544 MiB,
SHA-256:

```text
1d5617f1281a839ec8d249f686d3182dbbe3fc4e71584bcbcdfdce22eef27592
```

GLB записывается собственным небольшим writer: фиксированный порядок JSON/binary, float32, PNG без
времени и метаданных. Карты и отчёты сохраняются в `.scratch/keyboard88-bake/` и
`.scratch/keyboard88-export.json`; scratch не входит в публичную поставку. Повторные запуски
обрезанного варианта записаны в `.scratch/keyboard88-case-first.json` и
`.scratch/keyboard88-case-repeat.json`. Независимая бинарная проверка подтвердила границы обрезки,
замкнутые срезы и согласованное направление граней всех трёх деталей; геометрия остальных 93
объектов побайтно совпадает с поставкой 2a. SHA-256 исходной копии не изменился. Полный отчёт:
`.scratch/keyboard88-case-verification.json`.

## Контракт модели

Все actual `key-21`…`key-108` (52 белых, 36 чёрных) экспортированы с evaluated bevel geometry.
Скрытые template meshes не экспортируются. Каждый MIDI имеет свой node и `extras.midi`, `role=key`,
`dipM=.008`. Геометрия повторно используется: пять форм клавиш и шесть форм корпуса, всего 11
уникальных meshes для 96 nodes. Щёки и панели сохраняют отдельные восемь case nodes:

- `slip.001`, `board.001`, `felt.001`, `table.001`;
- `cheek-left`, `cheek-right`, `panel-left`, `panel-right`.

При экспорте evaluated геометрия `table.001` обрезается по внешним боковым граням щёк: X
−0.22725…1.06475 м вместо −0.28625…1.12375 м. Сзади весь корпус (доска, столешница, боковины, щёки)
срезан по Y=0.455 м, в 5 мм за задним краем клавиш (Y=0.45): тонкая панель вместо тёмной полосы
доски глубиной 34 мм и заднего выступа столешницы до 0.56 м. Границы берутся из исходных evaluated
вершин; bisect закрывает срезы плоскими гранями перед UV и триангуляцией, не растягивая фаски.
Передний Y=0.19 м и панели до пола сохранены. Верх `board.001` и щёк срезан по Z=0.738 м (было 0.768
и 0.774), `felt.001` опущен целиком на 9 мм под ту же высоту: все на 2 мм ниже белых клавиш, поэтому
ноты и огонь садятся на клавиши, а не уходят за доску. В пресете «Сверху» корпус не выступает за
щёки и назад за клавиши. Bench, pedal, rig, skin, nails, служебные объекты, анимация и персональные
модели в этом GLB отсутствуют.

Key mesh содержит primitives в порядке **top, body**. Примитивы и материалы имеют `extras.role`;
case имеет один primitive `case`. Нормали и тангенты сохраняются. `TEXCOORD_0` принадлежит baked
материалам; `TEXCOORD_1` — локальный painted overlay: X слева 0, справа 1; глубина от фронта 0 к
заду 1. Runtime не заменяет UV0 и не переделывает фаски через старый black cap.

Внутри девять PNG maps: четыре CPU Cycles baked ivory albedo 512² (включая скруглённый фронт), одна
512² tangent normal для процедурного black bump и четыре точных 1×1 albedo для постоянных
black/case/felt/table цветов. Roughness и coat исходных материалов сохраняются численно; процедурной
roughness-карты в исходнике нет. Все карты встроены в GLB, внешних texture URL нет. Gamma проверена
контрольным bake: linear (.25,.5,.75) даёт sRGB (137,188,225), результат совпал с Blender PNG на
всех 1024 контрольных пикселях. Normal map остаётся Non-Color.

## Метры и игровая привязка

GLB сохраняет абсолютные метры сцены, переводя Blender `(x,y,z)` в glTF `(x,z,-y)`. C4 front/top —
`(0.36,0.74,-0.30)`; C3 X=.1955, D3 X=.2190. Белый шаг 23.5 мм, ширина белой 22.5 мм, глубина 150
мм, чёрный верх на 12 мм выше белого. Runtime использует **один scalar 1000** для всех осей;
дополнительный пользовательский scene scale также единый. Полное пианино остаётся в сцене при узком
song range, диапазон меняет кадрирование камеры.

Клавиши опускаются параллельно на 8 мм. Road, hit line, effects, painted tops и raycast используют
один metric mapping; другие стили клавиш сохраняют прежние размеры. `piano-kit.glb` остаётся для
существующих legacy rig/geometry fixtures; native 3D загружает `keyboard88.glb`.

Board, felt и щёки теперь ниже белых клавиш. Рендер разделён на фон корпуса, дорогу, экранные
fire/glow, depth-only восстановление корпуса и клавиши/руки с native эффектами. Ранее экранные
эффекты рисовались до Three и новый непрозрачный корпус закрашивал их. Теперь callback между дорогой
и восстановлением depth рисует их поверх корпуса, но до рук; при переходе между Pixi и Three
сбрасывается GPU state. В свободной камере остаются native эффекты с физической проверкой глубины.
Curtain рисуется последним; членство объектов кешируется. В режиме компьютерной клавиатуры
сохраняется перспективная плашка, при возврате к пианино сохранённый 3D-вид восстанавливается.

## Проверки и ограничения

`keyboard88Asset.test.ts` проверяет реальный binary GLB: 88 MIDI, восемь case nodes, метры, пять key
meshes, top/body groups, обе UV, embedded maps, отсутствие rig/animations. Чистые тесты metric
mapping/framing и существующие тесты emission/picking проверяют runtime отдельно. Тест GLB также
проверяет границы столешницы относительно щёк и задний край трёх обрезанных деталей. Тесты проходов
фиксируют положение экранных эффектов между корпусом и руками, восстановление состояния при ошибке и
единый depth-проход свободной камеры.

Vitest запускается с `--pool=threads`. В текущем sandbox загрузка `vite.config.ts` останавливается
на `externalize-deps → optimizeSafeRealPathSync → spawn EPERM` до выполнения тестов. Конфигурация не
менялась ради обхода. Браузер и dev-сервер в этапе 2a не запускались; визуальная приёмка, аппаратный
MIDI и аудиопроверка этим отчётом не заявляются. Полные результаты команд передаются lead отдельно
от численной проверки GLB.

`pnpm build` в этом окружении останавливается на той же загрузке Vite config со `spawn EPERM`;
компиляция bundle не началась. Прежний fallback рук получил только вынужденные метрические адаптеры;
визуальное совпадение его кожи с новым ходом клавиш не проверено. Исходный solver сохраняется до
этапа 2b.

## Этап 2b: тело, кожа и атлас

Ветка `feat/game-visual-update`, worktree `E:/MySource/ReactJS/pt-agents/game-visual-update`.
Лаборатория только читалась, открывалась существующая `.scratch/atlas.blend` с SHA-256
`877f5023205f73f5789e800e8c7c8f3ff2c23336deea224f33e745badc83cf6d` (250994531 B). Обновление сцены
не требовалось: все 1215 кадров 308–1522 уже записаны. Библиотечный atlas продолжает меняться;
результат относится именно к этому снимку.

Frozen index/C4/audit/UV/albedo/README: `.scratch/performer-source/`, полная таблица 1063 файлов с
size/mtime/SHA — `frozen-sources.json`. Публичный manifest хранит SHA сцены, шесть source
descriptors и aggregate SHA 1057 audit-файлов
`fcb8abcc5f8031373f99b1257b8e9ae1d8bb88da573b040031e4f63b5a8a3423`. Audit snapshot отражает
метаданные момента freeze, а не новый аудит геометрии этой сцены.

| Публичный файл            |   Байты | SHA-256                                                            |
| ------------------------- | ------: | ------------------------------------------------------------------ |
| keyboard88-performer.glb  |  591352 | `755024be2d4a01966e5b6f50f759f67b0676201552bc798abc57eea38364c4c0` |
| keyboard88-skin.webp      | 2320426 | `a1f849ede7a0ad36fc5e12e8d16240d7eaab8b00a550d9ebcebc09a83b20d6ce` |
| keyboard88-poses.bin      | 1010880 | `96083dc1c5726da3109bfd168954d6f68363e513c2304fd0defd4246e46baa27` |
| keyboard88-atlas.json     |  290018 | `0213110f7339152af2c9f61bbcf3b2297b1c4ea90df214309bdfda16806800a5` |
| keyboard88-performer.json |   75808 | `d523b42a7d533adf00122668f74276f1f8c200134f457d335bddf0e2f6893f02` |

GLB 0.564 MiB ≤15 MiB; lossless skin 2.213 MiB; poses+index+manifest **1376706 B**, 1.313 MiB ≤2
MiB. Два полных запуска финального export/pack дали одинаковые bytes/SHA всех пяти файлов:
`.scratch/keyboard88-performer-repeat-proof.json`. Canonical JSON исключён из Prettier точными двумя
путями, поскольку его байты входят в проверенные SHA.

Тело — один исходный base6890 mesh, 13776 треугольников, 52 joints. Три disjoint primitives
разделены по source face IDs: body 9822, rightHand 1977, leftHand 1977; nail mask пустой.
`Pilot nail 1–5`, corrective shapes, GN, subdivision и local-models отсутствуют. Ногти существуют
только в принятом albedo. Остальное тело имеет простой материал одежды, без личных face maps;
отдельная качественная текстура лица не поставляется этим этапом.

Правая UV перенесена строго по source face/corner IDs. Для левой доказано полное топологическое
соответствие: mirrored seed triangle + обход manifold edges, биекция и involution всех 6890 вершин
/13776 граней, ноль конфликтов. Поэтому **левая рука текстурирована**, flat fallback не понадобился.
Геометрия не симметризована: rest asymmetry mean 4.980 мм /max 14.338 мм. Pillow 11.0.0, WebP
lossless method=4 exact=True; decoded RGB всех 4096² пикселей равны PNG.

Уточнение LBS: стандартный Three skinning использует четыре нормализованных наибольших веса на
вершину. Максимальная отброшенная масса исходных малых influences 0.5617%, средняя 0.00318%. Это
дополнительное приближение поверхности, записанное в manifest; костная проверка его не проверяет.
Rest subdivision не используется. Drift локальных translations ≤0.000220 мм, scale ≤4.18e−7; root во
всех кадрах постоянен.

### Воспроизведение экспорта

Первый freeze копирует метаданные/UV/PNG, не обновляя atlas.blend и не сохраняя lab:

```powershell
python -B tools/hand-rig/keyboard88_performer_freeze.py
python C:/Users/AlekseiHome/dev-settings/claude/mods/ops-hud/bin/ops_run.py --name gvu-performer-export --purpose "Экспортировать тело и все 1215 записанных вращений из замороженной копии атласа" --kind blender -- "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" --factory-startup --disable-autoexec -b -t 2 --python tools/hand-rig/export_keyboard88_performer.py -- --source .scratch/atlas.blend
python -B tools/hand-rig/keyboard88_performer_pack.py
python -B tools/hand-rig/verify_keyboard88.py --all-frames
```

Все Blender-запуски завершились, CPU, два потока, без GUI/MCP/GPU. На том же frozen source
повторяются export и pack; повторно freeze для byte comparison не нужен.

### Костная точность и residual

`verify_keyboard88.py --all-frames` проверяет source hashes, ID sets, bone order, masks, отсутствие
ногтей/morphs, бюджеты и decoded pixels, затем вызывает
`node --experimental-strip-types src/checkTools/keyboard88Verify.ts`. CLI применяет реальные
exported inverse bind matrices через `three.SkinnedMesh.getVertexPosition` к пяти одно-костным
distal-tail anchors: Thumb/Index/Middle/Ring/Pinky. Все 1215 кадров и 6075 anchors: **максимум
0.000674 мм**; независимый FK: **0.000466 мм**, оба ≤0.5 мм. Frozen Blender reference fixture
`tools/hand-rig/fixtures/keyboard88-bone-tips.bin`: 72900 B, SHA
`8ac7b5233cbd02d3ffd00068af4efa61052ad5eed7c9f6a3537dd7ea54499295`. Это проверка armature, а не GN
поверхности или правильности исходных RED-поз.

Mirror отражает skinning deformation вращений относительно X с обменом сторон и учётом rest
ориентаций. Two-bone shoulder/elbow correction переносит левое запястье на +18 мм без изменения
длин; counter-rotation запястья сохраняет его мировую ориентацию и все finger local rotations.
Root/pelvis не сдвигаются. Общие pelvis/spine/neck/head используют hemisphere-safe slerp-average.

Все 1215 mirrored кадров обработаны; ниже 2990 нажатых anchors, из них 2060 относятся к физическому
покрытию слева MIDI21–64, 930 — к целям вне клавиатуры. Покой не считается касанием. Residual
измеряется по bone tails, не по мягким подушечкам. Колонки — среднее /p95 /максимум, мм:

| Состояние                                             | До D3-reflected исходного anchor, physical | До верхней плоскости нажатой клавиши, physical | До D3-reflected anchor, вне88 |
| ----------------------------------------------------- | ------------------------------------------ | ---------------------------------------------- | ----------------------------- |
| До +18 мм                                             | 30.510 /35.621 /43.422                     | 19.631 /27.693 /40.110                         | 26.345 /33.180 /38.524        |
| После +18 мм, до torso mix                            | 14.675 /21.283 /28.032                     | 10.010 /22.758 /31.468                         | 10.879 /19.006 /24.767        |
| Torso mix одинаковых frame IDs                        | 16.642 /22.720 /136.583                    | 12.003 /23.823 /114.908                        | 91.593 /354.681 /466.250      |
| Torso mix разных frames, right offset +607 modulo1215 | 34.321 /115.604 /146.719                   | 29.474 /103.400 /149.828                       | 50.308 /184.281 /243.143      |

Недостижимых +18мм wrist targets в этих прогонах **0**. Проверяется closest point верхнего
прямоугольника клавиши при dip8мм, с исходными X/depth и white/black heights. У исходной правой руки
bone-tail→key error mean5.271 /p95 27.140 /max89.382 мм. Torso mix смещает и правые anchors:
mean27.538 /p95 213.611 /max467.027 мм. Это существенное ограничение принятого усреднения торса на
крайних наклонах, а не ошибка float32 экспорта; алгоритм не был молча изменён. Проверка offset+607 —
воспроизводимая выборка разных поз, не полный Cartesian product двух рук. Полный machine-readable
отчёт — `.scratch/keyboard88-bones-verification.json`.

### Runtime и границы приёмки

Pure Atlas/Plan/Sample/Quaternion владеют nearest ranking, held IDs, missing fingers и переходами по
song time. У 10/55 assignment без mask0 выбирается ближайший recorded rest по пяти MIDI; уточнение
записано в design/spec. В кадре используются binary search и reusable buffers. Mirror и view
применяют численный результат; исходные notes/score/оценка не меняются.

Public loader запрашивает manifest/body/skin/pose только для native 3D и rendered hands, проверяет
SHA/schema/count/версии и защищает поколения abort. Пока данные не готовы или повреждены, остаётся
hand.glb. Body/hands masks исключают вторую пару; hands-off сохраняется и в fallback. При готовности
сразу семплируется актуальное время. Тело доступно в production без local-models; настройки не
сбрасываются. В DEV при sourcePerformance сохраняется прежний частный режим. Нового gaze/head/foot
motion нет.

Реальный GLTFLoader parse и все три visibility роли проверены CLI без браузера. Unit-тесты добавлены
для exporter bones, mirror, selector/plan/sample, loader/visibility, production availability и host
owner/fallback. Официальные Vitest и build останавливаются **до выполнения** на загрузке Vite
config: `[plugin externalize-deps] Error: spawn EPERM`. Конфигурация обходами не менялась.
Visual/network/performance, аппаратный MIDI и audibility остаются отдельной приёмкой lead;
браузер/сервер/коммиты/push в этом поручении не выполняются.
