# Сохранённый этап: остановка 26 октября 2026

Работа остановлена по прямой команде пользователя. Ветка `feat/torso-follow-hand-reach`,
[PR #221 в dev](https://github.com/twilingway/piano-trainer/pull/221) открыт, не слит. Основная
папка на dev и стенд5190 не менялись. Задача расстановки рук ещё не закончена.

## Что сохранено и проверено

- 64 различные исправленные позы: прежние31 C3 и новые33. Все новые33 прошли свежий exact GPU-аудит,
  сериализацию и независимую проверку фактически сохранённой Blender-геометрии GREEN/source
  consistency.
- CURRENT `smplh-black-key-atlas.blend`, SHA256
  `67c9980e9f0aebfc2f1e7a7f0e3e0ecde4fb36c7b18dc2d022848f9ff132f63c`. После checkpoint64 новых
  записей поз не было; SHA повторно подтверждён при остановке.
- Strict guard:22069 записей без незапрошенных изменений; дробные кадры совпали. Неиспользуемые
  handles CONSTANT-кривых восстановлены точно в отдельной копии; старые отказы сохранены.
- Frozen51 C4 и9 контрольных кадров:60 кадров по121 фактической сетке совпали с прежним этапом.
  Pending отсутствует. Сводка1618 рабочих кадров:840G/92Y/686R — исходный аудит плюс проверенные
  замены33Y→G, не новый общий обход. В C3 остаются RED592,593,598.
- HUD установлен в Blender startup. Source-aware слой проверяет SHA аудита, generation и complete
  promotion receipt, сбрасывает прежний GREEN при неполной карте; старый frozen HUD не переписан.
  Пять unit-тестов и восемь live negative-сценариев прошли, повторная автозагрузка проверена.

GUI оставлен открытым: `natural64-review-stopped-20261026.blend`, сцена
`SMPLH Black Key Atlas Refined - Natural 64 Review`, кадр631. Последний пользовательский ракурс
отдельно сохранён через save-copy, без переоткрытия сцены:
`natural64-final-stop-20261026T192538Z.blend`, SHA256
`9f3ae5f1c731c07693637b19aed31541f6c29d6c77713823af437fb4ad4dc9ff`. Исходные
`user-session-preserved-20261026.blend`, `user-before-natural64-20261026.blend` и byte-copy
`natural64-review-20261026-67c9980e9f0a.blend` сохранены.

## Поворот корпуса и новый поиск C3

Absolute yaw относительно закреплённой сидячей базы проведён через codec, optimizer,
snapshot/restore и full156/сериализацию. CPU/CUDA parity прошла. Для631 пять GPU-стартов по40 шагов
достижимы и проходят exact RH/natural. Общий допуск остаётся null: не хватает полной независимой
проверки мировой геометрии LEFT. Source631 отдельно подтверждён fresh V4, FK/PSD и direct Bpy
bridge121 объектов; исключён только редакторский BOOLEAN/EDGE `.select_edge`.

Для592/593/598 сохранены свежие source proofs и явные численные старты: legacy thumb0→63,18°
для592/593, отдельный donor597 с настоящими pressed labels598. Из15 пробных torso-контекстов12
достижимы; отказ yaw−40° не доказывает невозможность клавиш.

**Новый фактический GPU-прогон:12 стартов×40 шагов завершён.** Полные позы и сериализация
согласованы, но ни один кандидат не прошёл natural proxy. Это не новые GREEN и не запись в сцену.
CPU-диагностика показала промахи подушечек в XY и работающие градиенты; ограничения сгиба не
исчерпаны. Подготовлены отдельные замороженные PLAN для exact RH-аудита этих12 результатов и
cold12×160 на прежних исходных стартах. Оба следующих запуска **NOT_RUN**;40 шагов не выдаются
за160.

Локальные артефакты относительно корня лаборатории:

- `probes/natural-hand-20261025/torso-yaw-c3-continuation-v1/runs/63f3e9f0f24b/report.json`;
- `probes/natural-hand-20261025/torso-yaw-c3-exact-v1/plans/1149b9a47335d94e/plan.json`;
- `probes/natural-hand-20261025/torso-yaw-c3-continuation-v1/plans/3070227cce7abc57/plan.json`.
- `probes/natural-hand-20261025/torso-yaw-c3-exact-v1/STOP-HANDOFF-V2-RU.md` — diagnosis/gradient
  receipts, точные команды и NOT_RUN следующего этапа.

## Нативная LEFT и поза покоя RIGHT

LEFT построена по собственным MANO_LEFT и геометрии, без отражения RIGHT. Проверены native axes,
hinges/opposition/collar, raw pads, CPU/CUDA full156/FK/PSD parity, сохранность RIGHT locals, таза и
длин костей. Factory Blender proof:165314 IDs/165312 oriented quads, ошибка≤0,000477мм при
допуске0,01мм. Actual FLOAT labels не подменены geometry-limit stencil. Полные
pads684/642/592/617/668; thumb subset411, контроль RIGHT523. Saved LEFT attributes в исходной сцене
и контакты этим не подтверждены.

Исторический standby602 сохранён отдельно как literal legacy thumb0. Четыре новых RIGHT варианта
thumb40/63,18° × wrist lift0/+20мм прошли CPU full156/FK/PSD и фактический GPU exact RH GREEN с
natural all-free PASS. Исправлены deepcopy ENTRY перед старым мутирующим Auditor и локальный
CUDA-контекст sparse операций; прежний неудачный v1_2 запуск сохранён. Артефакт:
`probes/native_standby602_v1_3/g/11e9d4e823/report.json`, SHA256
`e665bc1c2e53f553ee7e27429635c2d3657b6ba1ee884d7be06e076f086950bb`. Общий физический допуск null;
validated RIGHT standby=false до проверки обеих рук и корпуса.

LEFT inventory закреплён:74 случая A0–C6/MIDI21–84, пять пальцев на C4 и шесть совместных нажатий.
Все74 остаются NOT_RUN. C6 implementation/PLAN/model search не начинались; сохранён только handoff
`probes/native_left_c6_STOP-20261026-v1.md` с сравнением bases602/631 и предложением сохранить
свободные LEFT пальцы2–5. Spine602/631 различается; новую базу нельзя выдавать за fixture631.

## Коллизии: результат и конкретный незакрытый барьер

Прежнее отсутствие triangle crossings не исключало полного вложения. Старый producer заблокирован;
source631 остаётся UNRESOLVED, calibration=null. Shoulder radius90мм и физические masks не
расширены.

Новая точная affine partition исправила ownership всех198 физических query ROW без удаления точек:
756 смешанных треугольников разрезаны по native weight inequalities; физические payload/masks
побайтно сохранены. Ограниченное независимое ревью подтвердило этот результат. Но замкнутая topology
ещё не доказывает допустимый вычислительный объём.

Проверены285390 cap–cap пар первого fan. Последующий cap–skin аудит нашёл настоящее пересечение
длиной1,159642мм. Конечная проверка10 native joint-anchor вариантов не дала допустимого cap. Затем
выполнены все6 boundary-only disk trials по трём фиксированным проекциям: XY/YZ отклонены cap–skin
проверкой, XZ — точным пересечением границы. Ошибка decimal Fraction serialization в первой версии
сохранена; v7_1 меняет только HEX-кодирование, геометрические правила не ослаблены. Следующий
two-anchor вариант — только PLAN, не реализован.

Сохранены все отрицательные свидетельства. Полные embeddedness/inside/winding, source calibration и
candidate admission ещё не выполнены. Виртуальные caps не участвуют в физических расстояниях. Нужны
обе проверки LEFT↔NONLEFT и RIGHT↔NONRIGHT, где комплемент — объединение частей, с прежними physical
query и допустимыми RH upper bounds; противоречие inside и proxy даёт UNRESOLVED.

Последний semantic handoff: `probes/natural-hand-20261025/sd71/STOP-20261026-v2.json`, SHA256
`76c7d3847d44c60bbb58487633bcf05b7bfef854e8e407c5620e4c9d271533f6`.

## Что осталось и порядок продолжения

1. Закончить допустимый closed-volume kernel, source feasibility и независимую LEFT calibration.
2. Выполнить подготовленный C3 exact40; затем отдельный cold160 при необходимости. Получить полный
   exact RH+LEFT/natural PASS для592/593/598.
3. Реализовать строгий yaw writer: резерв, full156 identity, пересчёт surface/SIDE/nails,
   независимый saved readback и frozen/unrequested guard. Писать только полный PASS.
4. Подтвердить общий standby, реализовать native LEFT C6 и выполнить inventory74, включая
   фактический контакт MIDI84 и saved LEFT attributes.
5. Завершить оставшийся диапазон и общую позу двух рук с одним yaw/lean/bend/base; выполнить
   межручные/arm–body/keyboard проверки и отдельную визуальную приёмку.

Естественная кривизна свободных пальцев сохраняется; точный контакт нужен только нажатым. Нельзя
двигать всего пианиста, растягивать кости, менять frozen C4 или ослаблять допуски. Игровая
интеграция и переходы между позами этим локальным этапом не реализованы. Вопрос камер исключён
пользователем из этой задачи.

## Тесты, сохранение и публикация

Предыдущая полная проверка checkpoint64/HUD: `pnpm check` PASS —4178 тестов,23 compiler-теста,
сборка,10 существующих skipped; `pnpm spec:validate`74/74. CI PR на68e6ce2 — SUCCESS. Новые
локальные проверки: C3 numerical9, diagnosis/exact10, standby12, semantic27 pure controls и
compile/PLAN — PASS в своих ограниченных scopes. C3 exact GPU и LEFT C6 не запускались. Финальные
команды документационного checkpoint записываются в [verification.md](verification.md).

Все worker расчёты завершены; собственных GPU/CPU jobs и HTTP-серверов не осталось. Blender/MCP и
чужие стенды сохранены. Продолжение — только по новой команде пользователя.

Корень локальных данных:
`blender/labs/mano-reference-20261018/black-key-atlas-20261018/keyboard88-20261019/`. Итоговый
manifest с точными SHA: `probes/natural-hand-20261025/checkpoint-final-stop-20261026-v2.json`.

Модели MANO/SMPL+H, личные материалы, позы, сетки, NPZ, изображения, Blender-файлы и
экспериментальные скрипты остаются в игнорируемой локальной лаборатории. PR содержит только
авторский HUD с безопасными тестами и текстовые контракты/проверки. Worktree сохраняется вместе с
приватными артефактами.
