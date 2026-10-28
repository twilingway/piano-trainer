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

### 4a. Отказ исходной калибровки и новая базовая поза

Если независимые unsplit original-skin и saved Blender проверки подтверждают нарушение физических
запросов рук либо source certificate не получен, исторический source631 сохраняется побайтно и не
используется как новая LEFT calibration. Исправленная pose base создаётся отдельно с новой source
identity. Сначала меняются только native LEFT arm/collar controls в прежних bounds; pelvis, модель,
shape, rest/bind, scale, RIGHT locals и общий torso сохраняются. При необходимости менять torso
требуется новая явная версия и повторный bilateral/world proof. Старый отчёт не переносится на новый
base. Новая поза заново проходит correctives/nails, embeddedness, source feasibility и независимый
saved readback; исходное проникновение не становится новой нормой. Physical
masks/exclusions/allowances не расширяются.

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

Прежний bounded профиль `embedded-volumes-v1` сохраняется отдельно: связные замкнутые manifold
volumes рода0 с orientation/nondegeneracy/embeddedness каждой части; его UNRESOLVED отчёты не
переименовываются. Расширенный source-аудит выявил также BODY-only складки таза вне физических query
рук. Исправлять форму модели или расширять physical masks ради вычислительного объёма нельзя.

Новый версионированный профиль `certified-exterior-v2` использует достаточное доказательство
OUTSIDE: непрерывный луч от query к бесконечности, не имеющий ни одного пересечения со всей
замкнутой complement surface. LEFT/RIGHT остаются замкнутыми embedded manifold genus0. BODY должен
быть замкнутой ориентированной chain с прежними skin triangles; его собственные folds сохраняются
отдельным BODY_SELF_INTERSECTIONS_PRESENT, не выдаются за физический arm failure либо за исчезнувшие
пересечения. Свободный луч доказывает неограниченную внешнюю компоненту даже для immersed BODY.

Отдельный `certified-exterior-v3` сохраняет v2 и его отчёты неизменными, но разрешает immersed
original skin всех трёх частей. Для достаточного zero-hit-ray proof embeddedness собственной руки не
требуется: свободный непрерывный путь ведёт в неограниченную компоненту дополнения к surface.
Замкнутые oriented chains, точная partition/ownership/provenance и все исходные faces сохраняются.
Это не новый physical mask: прежние finger-pair, arm/body, межручные, skin/key, pad/nail и natural
hard gates обязательны независимо от exterior certificate. Own-part witnesses сохраняются отдельно;
попадание в запрещённый прежними правилами subset отклоняет позу. Длина intersection segment не
является depth и не сравнивается с allowances. Caps v3 по-прежнему требуют полного internality и
cap–skin/cap–cap proof; снятие original-skin embeddedness не разрешает их пересечения. Никакой
original skin face не сокращается из-за противоположной ориентации; сокращаются только доказанные
виртуальные interfaces. Все следующие coverage/uncertainty/source admission ограничения действуют
для v2 и v3 одинаково. Новое доказательство не переименовывает старые результаты.

Внутри v3 вводится отдельная версионированная computational partition по native family sums L/R.
Конечный порядок рациональных порогов фиксируется до построения: 2/5, 3/10, 1/5, 1/10. LEFT задаётся
L>=t и L>=R; RIGHT — R>=t и R>L; BODY — max(L,R)<t. Применяются exact affine inequalities и явный
tie order. Исходная oriented skin сохраняется полностью; slivers, faces и physical query не
удаляются. Все шесть неизменных query-наборов должны получить строгий ownership proof. Упрощённый
clipping двумя независимыми плоскостями разрешён лишь после доказательства для каждого original
triangle: min(max_vertex L, max_vertex R)<t. Отсутствие LEFT/RIGHT interface и triplepoints не
предполагается.

Выбирается первый порог закреплённого списка, прошедший полные topology/interface/cap/source gates.
Порог, source и partition/profile SHA фиксируются до candidate admission; кандидат не меняет их ради
прохождения аудита. Все отказы сохраняются. Новые interfaces проходят полный boundary/skin и
cap–skin/cap–cap/internality audit; уход от прежних witnesses не заменяет полного обхода. Изменение
cut не меняет physical masks/ROW/exclusions/allowances и actual-skin hard gates. Старые max-family
partition и её отказы остаются отдельными историческими inputs.

Фиксируется конечный набор направлений до вычислений. Broadphase покрывает все возможные faces;
narrowphase включает t=0, edge/vertex/tangent/coplanar touches. Для OUTSIDE_CERTIFIED нужны zero
hits и zero unresolved faces по хотя бы одному полному лучу. Нет hit budget, distance cutoff и
допущения winding0=outside. Отсутствие свободного луча среди выбранных направлений даёт UNRESOLVED,
не физический RED и не PASS. Source controls могут независимо проверяться exact rational CPU;
per-candidate certificate считается GPU interval arithmetic, неоднозначность не допускается.

В первых v2/v3 inside не допускается. Прежние 1/2мм allowances остаются неизменными; они не
используются для допуска по ближайшей внутренней складке. Поддержка shallow inside требует
отдельного actual-skin boundary witness q с сертифицированным расстоянием до query не больше
прежнего допуска и доказанным разделением реальных inside/outside; virtual cap или internal face не
подходит. Без такого доказательства результат UNRESOLVED. Upper-bound witness нельзя брать как
завышенный sourceDepth для новой калибровки. v2 сначала требует доказанного exterior каждого
обязательного source query и не нормирует проникновения.

Caps остаются только вычислительными интерфейсами. Вся поверхность cap проходит cap–skin/cap–cap
checks; touches/overlaps разрешены только на точном объявленном interface. Для связного открытого
disk interior полное отсутствие пересечения с original full skin и один точный interior sample с
oriented degree >=1 дают CAP_POSITIVE_DEGREE_CERTIFIED на всём interior. Нужны connectedness,
orientation, nondegeneracy, отсутствие скрытых касаний, sample вне кожи. Одних вершин/центроида без
глобального intersection proof недостаточно. Certificate повторяется для каждого кандидата.

Physical crossing/distance/depth/clearance считают прежнюю actual skin без caps. Симметрично
проверяются все прежние LEFT↔NONLEFT и RIGHT↔NONRIGHT query ROW; complements означают BODY OR другая
рука, не XOR. Внутренние caps сокращаются только как доказанные противоположные oriented faces.
Межручные проверки сохраняются отдельно. Query/membership/near30/skip90 и numerical allowances не
меняются, cap/border vertices не становятся новыми физическими query. Любая неопределённость
сохраняет calibration=null и eligible_for_write=false. Broadphase допускает встроенный Blender
BVHTree на standalone arrays; narrowphase обязан обрабатывать coplanar/tangent случаи. Новая
зависимость не вводится, CURRENT/пользовательские сцены при доказательстве kernel не меняются.

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
