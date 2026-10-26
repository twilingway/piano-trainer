# Корпус и нативная левая рука: устройство локальной фазы

## Context

Мотивация и согласованные условия — в proposal.md. Текущие handrules/WholeChain уже умеют
распределять signed twist по spine3/6/9, но IK4 держит body_twist фиксированным из source block.
BODY4 содержит swivel, forward lean, right collar protraction/elevation. Старые
request/build/make_entry также берут torso yaw из блока и могут потерять новый параметр.

Полная SMPL+H-анатомия левой руки присутствует; действующие finger chains, pad labels и auditor
ориентированы на right. `side` означает знак позиции клавиатуры и влияет на bend, а не выбирает
руку. Старые numerical results и frozen natural spec сохраняются отдельной фазой.

## Goals / Non-Goals

**Goals:** новый проверяемый codec и единая сборка yaw для CPU/GPU/judge/writer; сначала RIGHT,
затем native LEFT до MIDI84; общий торс для двух рук; реальный saved readback.

**Non-Goals:** перенос таза/пианиста, изменение костей/формы/масштаба, ослабление физических или
суставных правил, произвольные комбинации вне inventory, браузерный runtime и интерполяция игрового
исполнения.

## Decisions

### 1. Абсолютный signed yaw

`torso_yaw_deg` — отдельный параметр от thumb twist и BODY4, signed CCW вокруг keyboard/world +Z.
Первое окно поиска [-40,+40] использует прежнюю величину legacy fitting0..40; это численное окно, не
клинический предел и не delta к source yaw. Нейтральная seated base явно закреплена SHA. При yaw
равном source yaw воспроизводится исходная геометрия; yaw0 означает нулевой yaw при сохранённых
explicit lean/bend/collar/arm controls, а не сброс всей позы. Source roundtrip сравнивается при
совпадении остальных controls/base и порядка сборки.

Сохраняем существующую геометрию вращений spine3/6/9 и fixed pelvis/translation. Реальное
направление корпуса измеряется по FK: сумма углов при других наклонах не заменяет измерение heading.
Цель следования определяется положением рабочей руки относительно корпуса, а не только её локальным
hand_yaw. Исходная корректная поза остаётся incumbent; turn является поисковой возможностью, а не
обязательным лишним вращением каждой ближней позы.

Альтернатива — оставить fixed block yaw — сохраняет нынешнее ограничение. Перенос всего пианиста не
выбран пользователем и не вводится.

### 2. Явный codec без скрытых defaults

Новая typed версия хранит абсолютные wrist/R и локальные finger controls, `torso_yaw_deg`, shared
torso base, явные collar/arm controls и handedness. Старый manual-q относится к своему источнику и
не проигрывается поверх изменённого блока. Код генерации candidate, exact judge, entry/full156,
writer и readback использует одну объявленную сборку.

Collar задаётся явно в прежних пределах: legacy `min(twist/2,15)` даёт отрицательные значения при
negative yaw и не подходит. side умножает только bend; yaw не умножается на side/handedness. Нет
неявного clamp/SVD исправления невалидного ввода. Старый исходник читается через отдельную legacy
ветку и не переписывается как новый.

### 3. Общий torso и отдельные руки

Для RIGHT первого этапа прежний BODY4 сохраняется совместимым, yaw добавляется отдельно. В новой
полной схеме forward lean, signed bend/context и yaw принадлежат общему torso, а каждой руке — её
swivel и collar controls. Два BODY4 с разным lean нельзя молча объединить по одному yaw.

При совместной задаче одна spine-поза собирается до обеих рук. Вторая неактивная рука сохраняет
local controls, но её world pose следует за torso и проверяется. Независимые atlas PASS не подменяют
общий bimanual audit.

### 4. Нативная LEFT

Явный `hand=left/right` выбирает анатомию, а не знак white_steps. LEFT:
collar13/shoulder16/elbow18/wrist20; thumb34–36, index22–24, middle25–27, ring31–33, pinky28–30.
RIGHT остаётся отдельным прежним набором.

Нужны нативные оси сгиба/разведения, handed thumb opposition, left weights/skin, отдельные normative
pad labels и evaluated-ID↔subdivision-row map. Маски правой руки и её r12 arm calibration не
используются как доказательство LEFT. Пределы конфигурируются по прежним анатомическим именам с
явной проверкой знаков и source data; новые ослабленные значения для достижения C6 не вводятся.
Полная source-анатомия и left PCA/pose45 закрепляются SHA.

До GPU фиксируется конечный case inventory A0–C6 с назначенным пальцем/нажатыми нотами. White/black,
одиночные/совместные и C6 входят в ledger. Результат C6 не доказывает автоматически весь диапазон;
неподтверждённые записи остаются диагностикой.

Первый LEFT inventory содержит 74 случая: одиночное нажатие каждой MIDI21–84 пальцем2, кроме MIDI21
пальцем5 и MIDI84 пальцем1; ещё четыре одиночных MIDI60 пальцами1/3/4/5. Совместные назначения
палец→MIDI: 5→21/3→24/1→28, 5→48/3→52/1→55, 5→49/3→54/1→58, 5→48/3→51/1→55, 5→77/3→81/1→84,
5→78/3→82/1→84. Это покрытие каждой клавиши и всех пяти пальцев на C4, а не обещание всех пальцев на
каждой клавише. Свободным пальцам не назначаются дополнительные клавиши или XYZ. Начальный ledger —
NOT_RUN; отсутствие native proofs явно запрещает GPU и запись.

LEFT calibration требует независимо проверенную нативную исходную геометрию. Нельзя превратить
пересечение кожи в разрешённую норму, выбрав пересекающийся seed или максимум sweep как baseline.
Сохраняются прежние измерительные allowances: forearm1мм и upper slack2мм. Исключения для
соединённого плечевого шва задаются явно; остальные реальные пересечения остаются отказом.

### 5. Проверки и происхождение

#### Замкнутый classifier и физическая политика

Отсутствие triangle crossings не исключает полного вложения одной сетки в другую. Открытые native
patches не считаются закрытыми телами; численно неопределённый inside даёт UNRESOLVED и
calibration=null. Реальные границы source631 выходят за прежний 90-мм shoulder exclusion, поэтому
замыкание только внутри этого шара не подходит; радиус и физические masks не расширяются.

Новый отдельный bounded classifier распределяет все исходные треугольники между LEFT/RIGHT/BODY по
закреплённым native weight sums и tie order. Это вычислительная partition, а не новая физическая
mask. Подлинные interface loops закрываются одинаковыми внутренними cap с противоположной
ориентацией; их точное сокращение воспроизводит исходную ориентированную кожу.

Первый этап принимает только связные замкнутые manifold volumes рода0 с подтверждёнными orientation,
nondegeneracy и embeddedness каждой части. Сложные компоненты/cavities пока дают UNRESOLVED.
Joint-center fan требует проверки всей поверхности cap: cap–skin/cap–cap intersections, coplanar
overlaps и касания допустимы только на точном объявленном interface; cap должен находиться внутри
full-body volume. Одних вершин или центроида недостаточно. Certificate повторяется для каждого
кандидата; source calibration не доказывает корректность новой геометрии.

Caps используются только в signed winding/inside-классификации, без XOR разных объёмов. Они не
участвуют в физических crossings, расстояниях, глубине или clearance. Для arm–body сохраняется
прежний NONLEFT=BODY∪RIGHT со взаимным сокращением RIGHT-cap; LEFT↔RIGHT проверяется отдельно и
двунаправленно. Query ROW и membership остаются прежними; дополнительные cap/border vertices не
становятся физическими query. Любая неопределённость даёт UNRESOLVED без допуска.

Broadphase допускает встроенный Blender BVHTree на standalone arrays; narrowphase обязан
обрабатывать coplanar/tangent случаи. Новая зависимость не вводится, CURRENT/пользовательские сцены
при доказательстве kernel не меняются.

Сохраняются прежние own-key/pressed-set/pad/skin/finger-pair/arm-body/reach/natural правила и
numerical tolerances. Для нового yaw проверяется torso/оба shoulder transforms, длины и
неподвижность таза. Калибровка arm/body относится к конкретной текущей руке и case: успех597 с одним
пределом не переносится на598 или LEFT.

Source/code/model/shape/axes/posedirs/legs/stencil/keygeometry/context/membership закреплены
до/после. Исторические снимки — только численные старты; fresh current source gate и exact judge
обязательны. Neutral roundtrip, CPU/GPU FK/gradients ±yaw и full156/q identity предшествуют записи.
После смены raw pose заново считаются surface/SIDE и nails.

Негативные контроли: double source yaw, sign/side/hand перепутаны, negative collar default,
nonfinite/window/rotation/bounds, wrong left chain/pad/key, mirrored-right вместоleft,
bone/model/pelvis/translation change, clamp недостижимой руки, межручное/arm-body пересечение,
несовместимый torso, stale/right отчёт подан как left, source mutation и изменение frozen frame.

### 6. Владелец расчёта и стоимость

Расчёт — в чистых локальных numeric/model modules; Blender UI и HUD показывают готовые отчёты.
Оптимизация и точный candidate audit выполняются на GPU с прежним бюджетом12GiB/одним процессом;
source checks и независимый Blender-readback — на CPU. Proven topology cache разрешён с раздельными
ключами по model/hand/mask/dtype/device, без хранения изменяемой posed geometry.

Новые экспериментальные сцены/файлы не переписывают старые. React/render/staff/PracticeSession и
музыкальное время не затрагиваются; тяжёлый расчёт не переносится в UI draw loop. Приватные модели и
производные данные остаются вне Git.

## Risks / Trade-offs

- Неправильный yaw codec поворачивает руку вместо корпуса → actual FK плеч/spine и независимый
  readback.
- Negative yaw ломает старый collar default → явные collar controls и boundary tests.
- Левый pad/axis выглядит зеркально верно, но относится к правой геометрии → native
  anatomy/source/ROW proof и wrong-hand negatives.
- Новый torso даёт collision второй руки → один общий pose и проверка обеих рук, даже при inactive
  второй.
- Окна ±40 может не хватить → сохранять конкретный отказ, не заявлять невозможность и не выходить за
  окно скрыто.
- Геометрический PASS выглядит плохо → отдельные top/side views и пользовательская visual
  acceptance.

## Migration Plan

Текущий checkpoint уже закреплён; source rejudge прежних numerical poses выполняется отдельной
веткой проверки. Новые pure codec/CPU parity proofs можно разрабатывать параллельно на закреплённых
модельных данных без правки старой сцены, frozen кода и source generation. Фактические новые
GPU/scene-write этапы используют отдельный явно стабильный checkpoint; старые проверки не
подменяются новым yaw.

Новые версии codec/solver/scenes проходят RIGHT yaw proof/smoke/readback; затем LEFT
anatomy/inventory/audit и общую torso-композицию. Для отката используются прежняя сцена и резерв;
старые отчёты и frozen C4 не изменяются. В игру эта локальная фаза ничего автоматически не
импортирует.

## Уточнения вычислительного classifier по фактическому intake

Смешанные исходные треугольники делятся точными affine native-weight inequalities для всех трёх
владельцев; целый треугольник с majority label не доказывает ownership каждой query ROW. Общие edge
cuts едины, slivers не удаляются, snapping не применяется. Это уточняет вычислительную partition,
сохраняя исходную физическую кожу, masks и query.

Для полного допуска нужны симметричные LEFT↔NONLEFT=(BODY∪RIGHT) и RIGHT↔NONRIGHT=(BODY∪LEFT).
Внутренняя cap может отнести часть объёма руки к BODY, поэтому одной LEFT↔NONLEFT и LEFT↔RIGHT
недостаточно для доказательства отсутствия вложения. Inside чужой части — свидетельство для
проверки, не новое правило нулевого RH overlap. Прежние допустимые RH upper bounds сохраняются;
противоречие deep-inside свидетельства и обрезанного distance proxy остаётся UNRESOLVED до
надлежащего физического измерения.
