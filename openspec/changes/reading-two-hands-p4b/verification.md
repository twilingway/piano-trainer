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

Этот документ подтверждает подготовку плана, а не работу ещё не реализованного курса.

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
