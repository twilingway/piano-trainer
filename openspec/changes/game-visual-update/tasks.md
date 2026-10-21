# Tasks

Решения Q1–Q5 утверждены пользователем в брифе этапа 2a; открытых material decisions нет. В этом
запуске выполняется chunk 2b; этап 2a принят пользователем в браузере. Labs READ-ONLY, Blender
только на копии в .scratch/, background 5.2 CPU два потока. Длинные Blender-команды — через
ops_run.py с name gvu-<step>, русским purpose и kind blender. Нет GUI/MCP, GPU, browser/dev server,
commits/push. Все production-модули ≤500 строк.

## 1. Chunk 2a — спецификация, клавиши и корпус

- [x] 1.1 Переписать proposal/design/четыре delta specs по принятым bones+LBS, D3 mirror, nearest,
      80мс transitions, full88 metric/dip/table и бюджетам; сохранить инвентарь. Проверка: pnpm
      spec:validate; pnpm exec prettier --check openspec/changes/game-visual-update.
- [x] 1.2 Добавить tools/hand-rig/export_keyboard88.py: actual88 evaluated keys, восемь case
      объектов со столом, baked maps, UV для painted tops и стабильные top/body группы.
      Экспортировать public/models/keyboard88.glb из .scratch/atlas.blend дважды; проверить
      одинаковые bytes/SHA-256, MIDI21–108, groups/UV/bounds/materials и сообщить размер/команды.
- [x] 1.3 Интегрировать новый GLB в ThreeStage/PianoCase/KeyboardAppearance/ThreeKeyEmission: один
      scalar, полное пианино и камера диапазона, параллельный 8мм dip, сохранённые emission/painted
      tops. Чистые transform/MIDI/UV/groups/framing тесты рядом с кодом; проверить C3→D3=23.5мм,
      C3→C4=164.5мм, depth150мм независимо от resize/range. Проверка: pnpm exec vitest run
      --pool=threads <новые и изменённые test files>.
- [ ] 1.4 Согласовать world/camera/key surface/road/hit line/picking с метрическими keys, сохранить
      прочие виды, проекции, ввод и независимые камеры; касаться hands только вынужденно новой
      геометрией. Проверка: narrow tests mapping/framing/contact/picking, pnpm lint, pnpm typecheck,
      pnpm build. При Vitest spawn EPERM сообщить lead, config не менять.
- [x] 1.5 Передать lead изменённые файлы/GLB bytes/SHA, подход, отклонения и точные результаты
      spec:validate, prettier, lint, typecheck, build и Vitest. Проверка: git diff --check,
      независимое read-only ревью; визуальная/браузерная приёмка явно не выполнена в этом запуске.
- [x] 1.6 По замечанию после 2a обрезать в export_keyboard88.py столешницу по внешним X щёк и
      заднему Y board, боковые панели — по заднему Y board; закрыть срезы и обновить GLB/docs/spec.
      Проверка: два CPU-экспорта дают одинаковые bytes/SHA; независимая бинарная проверка границ,
      замкнутости, неизменности геометрии остальных 93 объектов и SHA .scratch/atlas.blend.
- [x] 1.7 По второму замечанию срезать верх board и щёк, опустить felt до Z=0.738 м, ниже белых
      клавиш, чтобы ноты не уходили за доску. Проверка: keyboard88Asset.test.ts на верх
      board/felt/щёк, два CPU-экспорта с одинаковым SHA.
- [x] 1.8 По третьему замечанию срезать весь корпус сзади до Y=0.455 м (тонкая панель 5 мм за
      клавишами). Проверка: keyboard88Asset.test.ts на задний край, два экспорта с одинаковым SHA.
- [ ] 1.7 Перенести экранные огонь/свечение после корпуса и дороги, до рук, сохранив native depth
      свободной камеры. Тесты порядка проходов и восстановления состояния добавляются рядом с
      реализацией; Vitest/build запускает lead из-за известного spawn EPERM sandbox. Проверка
      исполнителя: lint, typecheck, prettier изменённых файлов и spec:validate.

## 2. Chunk 2b — тело, кожа и вращения

- [x] 2.1 Зафиксировать актуальные копии сцены/index/C4/audit/UV/albedo с size/mtime/SHA и версиями.
      Экспортировать все 1215 IDs308–1522 независимо от RED/YELLOW/unknown. Проверка:
      tools/hand-rig/verify_keyboard88.py --all-frames сверяет ID sets/52 bone order/provenance;
      описать команды и фактические файлы в docs/KEYBOARD88_ASSETS.md.
- [x] 2.2 Добавить export_keyboard88_performer.py: один skinned SMPL-H base6890 mesh, rest
      weights/52 bones, ногти только в текстуре без отдельных meshes/bindings; необязательно rest
      subdivision1 с interpolated weights. Правая UV по source IDs, lossless WebP; доказать
      left/right correspondence или применить matched flat left skin и сообщить. Проверка:
      GLB≤15MiB, skin≈2.3MiB, decoded PNG/WebP pixels равны, нет personal/local-models данных.
- [ ] 2.3 Экспортировать локальные rotations 52 bones всех1215 кадров и root только при изменении,
      assignment/pressed/audit index. Проверка: pose+index суммарно≤2MiB; three.js-skinned fingertip
      anchors против Blender armature heads/tails max≤0.5мм **на всех кадрах**, до torso mixing; не
      сравнивать GN поверхность. Команда: pnpm exec vitest run --pool=threads
      src/render/three/keyboard88Bones.test.ts.

## 3. Chunk 2b — mirror, selector и sampler

- [ ] 3.1 Изолировать left mirror right key=100-left key относительно D3(.2190), body plane(.2100).
      Применить +18мм X только левому arm chain без stretch и изменения wrist/fingers; общий
      pelvis/spine/neck/head slerp-average, collar→fingers каждой стороны свои. Проверка: все
      mirrored frames residual до/после correction и torso mixing, максимум/ распределение, отдельно
      physical21–64 и цели вне88; tests keyboard88Mirror.test.ts; отчёт в docs/KEYBOARD88_ASSETS.md,
      не объявлять residual заранее равным bone tolerance.
- [ ] 3.2 Реализовать pure schema/index/nearest plan: held IDs, release-before-onset, missing finger
      nearest-by-key; ranking same finger set→MIDI L1→previous assignment→lower frame ID. Audit не
      влияет; нет stall на crossing/stretch/black/outside. Проверка: pnpm exec vitest run
      --pool=threads src/render/three/keyboard88Atlas.test.ts
      src/render/three/keyboard88Plan.test.ts; exact/nearest/ties/missing/overlaps/left/outside/
      empty song/seek-safe повторное планирование.
- [ ] 3.3 Реализовать random-access sampler по songTime: slerp, start=max(previous
      event,onset−80мс), press в onset, release к mask0 той же позиции, нулевые границы/повторы и
      torso compose. Допущение lead Q3 не объявлять collision-safe. Проверка: pnpm exec vitest run
      --pool=threads src/render/three/keyboard88Sample.test.ts; pause/seek/speed/same-time дают
      одинаковые значения, нет delta clock.

## 4. Chunk 2b — загрузчик, видимость и интеграция

- [ ] 4.1 Добавить public body/skin/малый pose loader с schema/hash/count validation,
      generation/abort/dispose. Сохранить hand.glb loading/failure fallback без двух пар, DEV
      local-models оставить нетронутым. Проверка: pnpm exec vitest run --pool=threads
      src/render/three/keyboard88Loader.test.ts; missing/corrupt/version/stale/pending/dispose; pnpm
      build и asset allowlist.
- [ ] 4.2 Добавить manifest body/hand masks и пустой nail mask, native view adapter, подключить pure
      plan/time; body off/hands off/переключение вида не сбрасывают session/preferences. Проверка:
      pnpm exec vitest run --pool=threads src/render/three/keyboard88Visibility.test.ts
      src/render/three/liveHandsScene.test.ts src/render/three/sceneCameraPasses.test.ts; одно тело,
      одна пара, без gaze/head/foot motion и изменения local-models path.
- [ ] 4.3 Выполнить видимую browser/Blender приёмку после2b: белые/чёрные idle/press/release,
      скин/ногти, mirror/torso residual, narrow/full range, road/hit line, painted tops/emission,
      независимые/free камеры, resize, pause/seek/repeat, loading/failure/network и toggles.
      Проверка: viewport/screenshots/ошибки/bytes/frame time/heap в отчёте, сохранён localStorage;
      synthetic input не выдавать за hardware MIDI/аудиоприёмку.
- [ ] 4.4 Согласовать с lead пересекающиеся deltas, получить review и выполнить pnpm check, pnpm
      spec:validate, prettier change и git diff --check. Проверка: назвать отдельно пройденные
      numerical/unit/visual/production gates; не закрывать чужие changes автоматически.

Состояние 2a: реализация и ассет готовы; spec/Prettier/ESLint/typecheck прошли. Vitest с threads и
`pnpm build` остановились до тестов/сборки при загрузке Vite config:
`externalize-deps → spawn EPERM`. Конфигурация не менялась. Задача 1.4 оставлена открытой до
успешной production сборки у lead; браузерная приёмка в этом запуске не выполнялась. Отчёт и полный
список файлов: `.scratch/stage2a-report.md`, команды экспорта и контракт:
`docs/KEYBOARD88_ASSETS.md`.

Состояние 2b: экспорт, mirror, selector/plan/sample, loader/visibility и native integration
реализованы. Два финальных экспорта идентичны; assets/budgets/lossless/1215 bone comparisons прошли
(`python -B tools/hand-rig/verify_keyboard88.py --all-frames`). Max Three-skinned anchor
error0.000674мм. Обе руки текстурированы по доказанной полной топологической биекции; отдельных
ногтей нет. Mirror/torso residual велик на крайних позах и явно приведён в
docs/KEYBOARD88_ASSETS.md.

Задачи с командами Vitest оставлены открытыми до запуска у lead: в этом sandbox Vitest/build
останавливаются при загрузке Vite config на `[plugin externalize-deps] Error: spawn EPERM`.
Независимый Node/assert прогон 19 pure сценариев и реальный GLTFLoader parse/visibility прошли; это
не официальный Vitest и не визуальная приёмка. Read-only reviewer проверил реализацию; исправлены
production availability тела и hands-off при public fallback, повторное ревью без блокеров. Browser
gate4.3 и общий gate4.4 остаются открытыми. Коммитов/push/сервера/браузера нет.
