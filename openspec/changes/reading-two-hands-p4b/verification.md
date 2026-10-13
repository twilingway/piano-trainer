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
остаётся на dev. Новый курс не доставлен на стенд, production групп 2–7 ещё не начат.

## Согласование

Подтверждение материальных решений P4b-2 пока не получено. Реализация групп 2–7 не начата.
