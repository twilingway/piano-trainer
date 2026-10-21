# Keyboard88: клавиши и корпус, этап 2a

Результат находится в `public/models/keyboard88.glb`. Тело, атлас вращений, зеркальная левая рука,
selector/sampler и публичный загрузчик пианиста относятся к этапу 2b и здесь не реализованы.
Принятые решения и будущие проверки — `openspec/changes/game-visual-update/`.

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

Три независимых полных запуска дали одинаковые **585272 байта**, 0.558 MiB, SHA-256:

```text
00c3885cce67816991b5f1f092213568bfb7a2a45fcf2e03b6446cf8c69773ae
```

GLB записывается собственным небольшим writer: фиксированный порядок JSON/binary, float32, PNG без
времени и метаданных. Карты и отчёты сохраняются в `.scratch/keyboard88-bake/` и
`.scratch/keyboard88-export.json`; scratch не входит в публичную поставку. Последний полный запуск
занял 11.409 с. Независимая сверка границ всех 96 объектов с Blender дала максимальную компонентную
ошибку 0.0000593 мм; исходная копия осталась неизменной.

## Контракт модели

Все actual `key-21`…`key-108` (52 белых, 36 чёрных) экспортированы с evaluated bevel geometry.
Скрытые template meshes не экспортируются. Каждый MIDI имеет свой node и `extras.midi`, `role=key`,
`dipM=.008`. Геометрия повторно используется: пять форм клавиш и шесть форм корпуса, всего 11
уникальных meshes для 96 nodes. Щёки и панели сохраняют отдельные восемь case nodes:

- `slip.001`, `board.001`, `felt.001`, `table.001`;
- `cheek-left`, `cheek-right`, `panel-left`, `panel-right`.

Сохраняются исходные размеры корпуса, стол и панели до пола. Bench, pedal, rig, skin, nails,
служебные объекты, анимация и персональные модели в этом GLB отсутствуют.

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

Сохранённые board/felt находятся выше плоскости дороги. Рендер разделён на фон корпуса, дорогу,
depth-only восстановление корпуса и клавиши/руки с эффектами. Это сохраняет все восемь частей и
физическую окклюзию рук без отделяющей полосы поверх нот. Curtain рисуется последним; членство
объектов кешируется. В режиме компьютерной клавиатуры сохраняется перспективная плашка, при возврате
к пианино сохранённый 3D-вид восстанавливается.

## Проверки и ограничения

`keyboard88Asset.test.ts` проверяет реальный binary GLB: 88 MIDI, восемь case nodes, метры, пять key
meshes, top/body groups, обе UV, embedded maps, отсутствие rig/animations. Чистые тесты metric
mapping/framing и существующие тесты emission/picking проверяют runtime отдельно.

Vitest запускается с `--pool=threads`. В текущем sandbox загрузка `vite.config.ts` останавливается
на `externalize-deps → optimizeSafeRealPathSync → spawn EPERM` до выполнения тестов. Конфигурация не
менялась ради обхода. Браузер и dev-сервер в этапе 2a не запускались; визуальная приёмка, аппаратный
MIDI и аудиопроверка этим отчётом не заявляются. Полные результаты команд передаются lead отдельно
от численной проверки GLB.

`pnpm build` в этом окружении останавливается на той же загрузке Vite config со `spawn EPERM`;
компиляция bundle не началась. Прежний fallback рук получил только вынужденные метрические адаптеры;
визуальное совпадение его кожи с новым ходом клавиш не проверено. Исходный solver сохраняется до
этапа 2b.
