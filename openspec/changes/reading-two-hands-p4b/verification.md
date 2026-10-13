# Проверка плана P4b-2

## База и доставка P4b-1

План начат от dev a6d165be1141bd04c2b8114ebc695aca18bef220 после пользовательского «влил 157». #157
подтверждён MERGED и ff-only подтянут в основную папку; CI merge success:
https://github.com/twilingway/piano-trainer/actions/runs/38370200960. Основная папка остаётся чистой
на dev. Пользовательский Vite5190 PID98836 обслуживает её; сервер не запускался и не перезапускался.

Изолированный Chrome context p4b-header-20261013, page6, проверен после pull на прежнем 5190:
заголовки «Левая рука: отдельные ноты», «Левая рука: короткие фразы», «Left hand: single notes»,
«Left hand: short phrases»; served ConnectedPlayerHeader содержит BASS_READING_TASK_LABELS. Полные
проходы/мобильные acceptance #156 уже описаны в его verification.md и не повторялись ради заголовка.
Физический MIDI/слышимость/hidden P4b-1 всё ещё открыты.

## Аудит

Read-only spec_architect подтвердил границу simultaneous→hold→independent rhythm; выявил
необходимость полного pointer ownership пути и финализации после release с третьей нотой. Explorer
подтвердил, что обычный wait засчитывает ноты по одной, ReadingSession не имеет off, экранный ввод
монофоничен, а timestamp overlap требует bounded reorder/горизонта доставки. Эти выводы вошли в
proposal/specs/design и группы задач; production не изменялся.

## Проверки

Независимый reviewer нашёл и исправлением плана закрыты противоречия сценариев release/финальности и
возможность ложного успеха после pointercancel. Итоговое ревью: блокеров нет. Дополнены exact-set
atomic commit, age251 off recovery, различение UI route cancellation/mixed-origin ошибки и лимит
журнала256.

- pnpm check: format/lint/typecheck/test/build прошли; 199 test files passed/1 skipped, 1865 tests
  passed/1 skipped. Production-код базы не менялся.
- pnpm spec:validate: 46 passed, 0 failed, включая новый change.
- После правок ревью повторены scoped formatting/spec checks; полный test/build не повторялся,
  поскольку менялись только Markdown-артефакты.

Этот раздел описывает проверки исходного плана; проверки реализации приведены ниже.

План опубликован в draft PR #158 в dev: https://github.com/twilingway/piano-trainer/pull/158.
Рабочая ветка docs/reading-two-hands-p4b отслеживает собственную origin-ветку; основная папка
остаётся на dev. До merge #158 новый курс не доставлен в основную папку.

## Реализация

Группы 2–6 реализованы: генератор/два стана, pure TwoHandSession, строгие evidence/results, парный
Trainer path с атомарным commit, pointer ownership/timestamps, schema6/coordination, отдельный hook
и RU/EN интерфейс. NoteIds совпадают с parsed Song, второго clock нет.

Ревью выявило и исправлены: переставленный prefix off, mixed-origin с разными offsets, третья свежая
атака, MIDI channel16 (проект 1–16), перенос помощи между session, completed Play, ghost-held и raw
ties tracker. Последующее независимое ревью подтвердило устранение блокеров. Отдельные regression
tests покрывают перечисленные случаи, физические проверки не подменены.

Первый полный pnpm check после интеграции: 209 files passed/1 skipped, 1943 tests passed/1 skipped,
format/lint/typecheck/build прошли. Затем добавлены три случая expired matching/older off; их narrow
tests35/35 прошли, итоговый full gate будет записан после финальной проверки. pnpm
spec:validate46/46. Браузерная проверка ветки и post-merge/аппаратная приёмка пока открыты.

## Согласование

Пользователь ответил «продолжай» на конкретное предложение #158: десять пар C3–G3/C4–G4, окно <=200
мс с перекрытием, финальность после полного отпускания без лишней ноты, MIDI/ПК/мультитач и
отдельная локальная история схемы6. Это подтверждает реализацию групп 2–7 в том же PR; новых
материальных решений за границы proposal не добавляется.

## Итоговый gate и браузер ветки

Итоговый `pnpm check` прошёл: format/lint/typecheck, 209 test files passed/1 skipped, 1946 tests
passed/1 skipped, production build. В gate добавлен `pnpm test:compiler`: 5/5 hook-тестов с
включённым React Compiler. `pnpm spec:validate`: 46/46. Независимые reviewer core/runtime и
input/persistence не нашли оставшихся блокеров. Финальное targeted ревью helper выбора прохода и
мобильного CSS также без блокеров. Реализация опубликована в #158, implementation HEAD 6c6426a;
последующая правка затрагивает только кодировку и содержание итогового отчёта.

В видимом Chrome на прежнем пользовательском 5190 проверен исходный код task worktree через
игнорируемый source-preview.html, изолированный context p4b-two-hands-source-20261013/page8.
Основная папка всё время осталась на dev a6d165b; новая функция ещё не появилась по корневому URL.
Сервер агент не запускал. Музыкальное время не подменялось: DOM keyboard down/up поступали в
настоящий Trainer, который продвигал PracticeSession на своих кадрах.

Первый полный проход seed1: 10 пар, одна намеренная неверная высота и одна ручная помощь; результат
1 ошибка/1 пара с помощью/9 самостоятельных первых пар. Каждый переход требует полного отпускания.
Найден completed Play regression: React Compiler убирал revision из зависимостей генератора и
оставлял прежний Song. Новый оценщик получал законченный PracticeSession. Исправлено вызовом
selectedExercise с целым объектом выбора. Проверка с compiler падает на прежнем коде (Song сохранил
identity), проходит на исправленном. После исправления два полных прохода подряд одной кнопкой
«Играть»: 10/10, 0 ошибок, 0 помощи, 10 самостоятельных; история увеличилась по одному результату.
Подсказки между проходами не переносятся.

Отдельно проверены третья нота до release (включая оставшийся удержанным лишний ключ), раннее
отпускание, поздняя вторая атака, пауза незаконченного кандидата: текущая пара остаётся, неполная
серия в историю не попадает. Reload возвращает остановленную первую пару, историю4 и настройку
automaticHints=false. Кнопка «Новая серия» сохранила seed2. Read-only IndexedDB проверка показала
schemaVersion6, coordination.seed2/history4; пользовательский storage не очищался. Выход восстановил
обычную песню, правую руку и 75% скорости. Фильтр keyboard сохранил ошибки/помощь.

Визуально просмотрены RU practice на 320×568, 390×844, 667×375 и desktop1365×900, RU intro320 и EN
intro desktop. Исправлены обрезание нижнего стана и скрытый release status: только для
two-hand-practice отменён мобильный max-height стана, feedback поднят и закреплён, короткий экран
получил меньшую прокручиваемую панель. Оба стана и клавиши видны, body overflow нет. RU/EN
заголовки, инструкции и назначения проверены в accessibility snapshot. Ошибок console нет.

Evidence в игнорируемой `.browser-artifacts/` основной папки: p4b2-320-intro.png,
p4b2-320-practice-after.png, p4b2-390-practice-after.png, p4b2-667-practice-after.png,
p4b2-desktop-result.png, p4b2-desktop-resize.png, p4b2-intro-en.png, p4b2-ordinary-restored.png;
p4b2-first-run.json, p4b2-fixed-first-run.json, p4b2-fixed-repeat-run.json,
p4b2-error-release-pause.json, p4b2-source-filter.json, p4b2-saved-profile.json. Они не добавляются
в публичный git.

Полная задача7.3 ещё открыта: повторить на корневом dev после merge, проверить смену реальных
источников между попытками и ordinary two-hand/road. В альтернативном preview собранного dist через
Vite FS возникала duplicate Pixi extension, поэтому он не является приёмкой production. В
source-preview некоторые немедленные captures после reload/смены языка показывали пустые клавиши/ещё
не готовый SVG; после resize/отрисовки проверены отдельными снимками. Это ограничение веточного
предпросмотра требует повторной проверки на корневом URL после merge; полную стабильность reload
render не заявляем. Физический MIDI/rollover ПК/мультитач, слышимость и настоящий hidden остаются
задачей7.4. Change не архивируется до этой приёмки.
