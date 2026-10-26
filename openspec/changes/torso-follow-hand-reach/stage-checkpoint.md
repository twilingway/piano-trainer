# Checkpoint: остановка 26 октября 2026

Этап сохранён и остановлен по прямой команде пользователя. Полный атлас, физический допуск новых поз
с yaw и LEFT C6 не объявляются готовыми. Ветка `feat/torso-follow-hand-reach`, PR #221 в `dev`.
Основная папка пользователя и стенд5190 не изменялись; собственные HTTP-серверы не запускались.

## Сохранённый результат

- 64 различные исправленные позы: прежние31 C3 и новые33. Новые33 прошли fresh exact GPU,
  сериализацию и независимый actual saved Blender-аудит GREEN/source consistency.
- CURRENT SHA256: `67c9980e9f0aebfc2f1e7a7f0e3e0ecde4fb36c7b18dc2d022848f9ff132f63c`. Локальный
  `checkpoint-sixtyfour-verified-v1.json`:
  `6ec15653dc4a2eefe49216f3dbc5a2855995577a5aa313d3b2b2a8f5d2705196`.
- Исходный strict scene guard прошёл22069 записей без изменений вне новых33. Неиспользуемые
  AUTO_CLAMPED handles CONSTANT-кривых восстановлены точно в отдельной копии; сами позы и оценки на
  дробных кадрах не менялись. Старые failed-свидетельства сохранены.
- Все51 frozen C4 и9 контрольных кадров совпали с прежним этапом:60 кадров по121 фактической сетке.
  Pending отсутствует. Сводка1618 рабочих кадров:840G/92Y/686R, полученная из исходного аудита и
  подтверждённых замен33Y→G; нового общего обхода не было.
- В C3 остаются592,593,598. Число64 не означает готовность всех клавиш или визуальную приёмку.

GUI: `natural64-user-review-20261026.blend`, сцена `Natural 64 Review`, при открытии кадр631.
Исходная пользовательская сцена сохранена дополнительно в `user-before-natural64-20261026.blend`.
Камеру/кадр после этого пользователь может менять; его дальнейшее состояние не перезаписывается.
Отдельная byte-copy `natural64-review-20261026-67c9980e9f0a.blend` сохраняет исходный SHA67c.

HUD установлен в Blender startup и проверен после открытия новой review-сцены. Source-aware слой
проверяет SHA каждого нового аудита, complete promotion receipt и generation. Неполная карта
сбрасывает прежний GREEN. Старый замороженный `kb88_hud.py` и ROOT/audit не переписаны.

## Поворот корпуса и нативная LEFT

Absolute yaw относительно закреплённой сидячей базы проходит codec, optimizer, snapshot/restore,
full156 и сериализацию. CPU/CUDA parity10 случаев PASS. Численный поиск631:5 стартов×40 шагов, все
достижимы. Свежий exact RH-аудит и natural-проверка всех5 — PASS. Общий класс=null и запись
запрещена: отсутствует полный inactive LEFT world proof. Source631 отдельно подтверждён fresh V4
authority, полным model FK/PSD и direct Bpy geometry bridge121 объектов; только редакторский
BOOLEAN/EDGE `.select_edge` исключён из геометрического сравнения.

Нативная LEFT построена по собственным моделям/геометрии, без отражённой RIGHT. Подтверждены знаки
сгиба/opposition/collar, raw pads и четыре пространства индексов. Factory Blender proof: 165314
IDs/165312 oriented quads, геометрическая ошибка≤0,000477мм при прежнем допуске0,01мм. Actual FLOAT
labels не подменены geometry-limit stencil. Полные pads684/642/592/617/668, thumb subset411 точно
соответствует legacy-алгоритму; контроль RIGHT523.

LEFT Pose/WholeChain прошла CPU/CUDA parity3 поз, bounds/source/reach negatives и сохранность RIGHT
locals/таза/translation/длин. Контакты, standby, saved LEFT attributes и C6 этим не доказаны.
Конечный LEFT inventory:74 случая — каждая MIDI21–84, все5 пальцев наC4,6 совместных нажатий. Все74
пока NOT_RUN; MIDI85 отклоняется.

## Незавершённые текущие заготовки

**C3 yaw search:** fresh источники592/593/598 и CPU proof сохранены. Для592/593 задана явная
миграция legacy thumb0→63,18°, для598 — отдельный CURRENT597 donor с labels/pressed set598.
Ненормализованный source сохранён как literal incumbent, не выдаётся за bounded request. Из15
контекстов12 достижимы; yaw−40° для всех3 недостижим в этом пробном наборе. Это не доказательство
невозможности клавиш. 6 pure-тестов PASS; GPU15/optimizer/exact C3 не запускались. Остались driver,
fresh-membership wrapper, reviewed GPU PLAN и фактический поиск.

**LEFT collision/calibration:** старый producer v1 заблокирован — zero triangle crossings не
обнаруживает полную вложенность. Generic v1_1 закрывает deep95мм и другие synthetic negatives, но
настоящий source631 остаётся UNRESOLVED/calibration=null: его patch boundaries выходят за
прежний90мм shoulder exclusion. Радиус/masks не расширяются. Новый semantic partition/fan intake —
только заготовка вычислительных объёмов; embeddedness, cap-validity, winding и физический допуск ещё
не подтверждены. Computational caps не становятся физической кожей или clearance-поверхностью.

**Standby602:** найден исторический RIGHT rest с pressed=[] и actual saved GREEN. Он остаётся legacy
thumb0, не новым bounded candidate. Новый helper — WIP,8 pure-тестов PASS; backend/model
full156/FK/PSD/noPressed/GPU ещё не запускались. Черновик PLAN с повреждённым UTF-8 не принят и
сохранён как diagnostic; перед продолжением нужна новая корректная UTF-8 версия.

## Порядок продолжения

1. Закончить closed semantic classifier с точными physical masks и NONLEFT=BODY∪RIGHT,
   coplanar/tangent/containment negatives; подтвердить source feasibility и независимую calibration.
   Любая неоднозначность остаётся UNRESOLVED, без допуска и без source-overlap normalization.
2. Завершить C3 finite driver/guards и прогнать15 стартов; при необходимости отдельную конечную
   continuation. Затем fresh exact RH+LEFT и natural judge для592/593/598.
3. Добавить отдельный строгий yaw writer: резерв, full156 identity, surface/SIDE/nails, независимый
   saved readback и frozen/unrequested guard. Записывать только полный PASS.
4. Подтвердить новый standby602, нативной LEFT выполнить74-case inventory, включая реальный
   контактC6/MIDI84, actual saved LEFT attributes и независимый Blender-readback.
5. Завершить остальной объявленный диапазон/общую позу двух рук и визуальную приёмку. Совместные
   позы обязаны иметь один yaw/lean/bend/base. Игровая интеграция и переходы между позами отдельно
   этим локальным этапом не реализованы.

Нельзя двигать всего пианиста, растягивать кости, ослаблять прежние bounds или менять frozen C4.
Free fingers сохраняют исходную естественную кривизну как мягкую цель; точное касание нужно только
нажатым. C2 bank не менять; frame319 оставлен последним bank-dependent исправлением.

## Проверки и локальные handoff

- `pnpm check` — PASS после checkpoint64/HUD:4178 обычных тестов,23 compiler-теста и сборка; 10
  тестов пропущены существующей конфигурацией.
- `pnpm spec:validate` —74/74; Prettier и `git diff --check` — PASS.
- HUD:5 автономных unit-тестов,8 live negative сценариев, фактическая автозагрузка33 source-aware
  записей и независимое review — PASS.
- Native hand:12 тестов; pads:11; LEFT chain:11; RH integration:11; exact631:18 — PASS в своих
  ограниченных scopes. Generic LEFT containment:7 tiny CPU-тестов, но actual calibration
  отсутствует.

Корень локальных данных:
`blender/labs/mano-reference-20261018/black-key-atlas-20261018/keyboard88-20261019/`. Точные
пути/SHA/code/commands текущих заготовок:

- `probes/natural-hand-20261025/torso-yaw-c3-v1/STOP-HANDOFF-V1.json` и `STOP-HANDOFF-V1-RU.md`;
- `probes/native_standby602_v1_STOP-20261026-v1.md`;
- `probes/natural-hand-20261025/checkpoint-sixtyfour-verified-v1.json`;
- [фактические proofs и ограничения](verification.md).

Модели MANO/SMPL+H, личные материалы, позы, сетки, атрибуты, изображения и экспериментальные скрипты
остаются в локальной игнорируемой лаборатории. В PR входят авторский HUD, его безопасные тесты и
контракты/описания проверки. Автоматической публикации моделей и игровой интеграции нет.

## Последний semantic intake и остановка процессов

До команды остановки завершён CPU-only intake: BODY195952/LEFT67347/RIGHT67325 исходных
треугольников. Парные opposite fans дают closed connected genus0 topology, но198 физических query
ROW (100 LEFT+98 RIGHT) ещё не имеют подтверждённого semantic ownership. Результат —
STOP_UNRESOLVED_INTAKE, calibration=null; embeddedness, внутренность cap и GPU не проверялись. Это
не полный физический classifier. Generic foundation7 и intake5 tiny-тестов, compile/PLAN прошли,
исходные маски не менялись.

Локальный STOP receipt: `probes/natural-hand-20261025/semvol1/STOP-20261026-v1.json`, SHA256
`dc96b634a6d8b403d4c34fec8a25a284eba3ca8dd5e75accf427f8791db443a7`. Все собственные managed jobs и
worker turns завершены. Blender/MCP и пользовательские/чужие процессы сохранены. При возобновлении
нужны fresh CURRENT/membership checks и новые reviewed run-specific PLAN; исторический GREEN не
заменяет актуальный допуск.

## Итоговый остановленный снимок

Единый локальный `probes/natural-hand-20261025/checkpoint-stage-stopped64-20261026-v1.json` сохранён
с SHA256 `da0a3771e544798f33d47eab2e1c5d59c93f0abcabd97c5b5ebc735c0cfd1014`. Он связывает все
готовые proofs и три STOP-handoff, тесты, незавершённые этапы и отсутствие собственных процессов.
Active HUD pointer помечен STOPPED_BY_USER, все64 записи и карта аудитов сохранены. Последний
GUI-снимок: `natural64-review-stopped-20261026.blend`, при сохранении кадр631; CURRENT67c и прежние
review/пользовательские файлы не перезаписаны.

Worktree содержит ценные игнорируемые модели и незавершённые локальные инструменты. Его нельзя
удалять по одному `git status --short`: сначала нужно отдельно сохранить всю лабораторию.
Продолжение требует новой команды пользователя.
