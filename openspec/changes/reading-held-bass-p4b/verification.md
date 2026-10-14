# Проверка P4b-3

## Реализация и приёмка ветки

Реализован согласованный курс «Держу бас, играю мелодию»:10 фрагментов2/4, initial200мс, непрерывный
бас до song.duration, текущие RH onset2→1, max2 RH, full retry, отдельный журнал и schema7
IndexedDB. Версия пакета не менялась. Основная папка остаётся на dev d863da1; просмотр нового курса
до merge выполнен из исходников task-ветки через Vite filesystem на существующем5190, в отдельном
видимом Chrome-контексте. Это не postmerge-проверка основной папки.

Финальный `pnpm check`: формат/ESLint/TypeScript зелёные;215 files passed/1 skipped, 2041 tests
passed/1 skipped;10/10 проверок React Compiler; production build успешен. Сохранилось предупреждение
Vite о размере bundle. `pnpm spec:validate`:47/47,0 failed. Начальный запуск Vite тестов в sandbox
получил spawn EPERM; повтор с разрешением прошёл. Один запуск гейта с PowerShell перенаправлением
вывода вернул NativeCommandError на предупреждении build; финальный запуск без перенаправления
завершился с exit0.

Независимые reviewer проверили ядро/practice и shell/storage. Исправлены найденные terminal down
после release, ранняя помощь будущего шага, Pause при finished+playing, stale async Play, offset
помощи до доставки down и восстановление клавиш после retry. Добавлены регрессионные тесты.
Повторный shell-review подтвердил36/36 hook-тестов и отсутствие новых замечаний. Последняя попытка
дополнительного core re-review остановлена лимитом агента; последние поправки проверены root и 49
тестами ядра. Браузер выявил устаревший ready сразу после onset: теперь статус пересчитан
немедленно. Во время двухсекундного отсчёта UI явно просит дождаться начала.

Видимый Chrome, seed1: полный проход10 фрагментов, длины2,2,2,4,2,2,4,4,4,4. Использованы DOM
KeyboardEvent по действующим назначениям ПК, без изменения clock или состояния приложения.
После10-го физического release и горизонта появился итог; IndexedDB содержит ровно1 результат, 10
фрагментов, validateHeldBassResult принимает сохранённый журнал. Повтор одной кнопкой создаёт новый
проход. Неверная RH после начальной группы возвращает весь текущий фрагмент к шагу0; показанные
имена и две клавиши сохраняются (снимок retry-help). Frozen wait сохраняет бас и готовность. Пауза
после song.duration+350мс с удержанным басом останавливает проигрывание и не добавляет результат.
Reload возвращает остановленный первый фрагмент, история1 остаётся.

RU/EN, desktop1365×900, mobile320×568/390×844/667×375: оба стана видны, горизонтальный overflow0,
панель курса прокручивается; settings доступны при смене ориентации. На667×375 после resize canvas
клавиатуры находится в y265..375. Снимки осмотрены; ошибок console нет. Артефакты git-ignored:
`.browser-artifacts/held-bass-desktop.png`, `held-bass-completed.png`, `held-bass-retry-help.png`,
`held-bass-320.png`, `held-bass-390.png`, `held-bass-667.png`, `held-bass-en-390.png`,
`held-bass-settings-390.png`, `held-bass-settings-667.png`.

Настоящие MIDI/rollover/мультитач, педаль, слышимость и физическое скрытие вкладки не проверены. По
просьбе пользователя это совместный этап после всех шагов roadmap, не blocker разработки. Change не
архивируется; postmerge5190 и hardware остаются открытыми.

## Подтверждение реализации

После публикации draft PR159 пользователь ответил «подтверждаю» на конкретные правила proposal. Это
разрешает production:10 фрагментов2/4, WAIT120, бас до музыкального конца, full retry, max2 RH
legato и early readiness error. Аппаратная MIDI-приёмка остаётся после всех шагов. Все planning
artifacts готовы и spec47/47 пройден до начала реализации.

## База

Чистый dev d863da148c151403182bbac0070ca679e1228265 после merge#158, CI success:
https://github.com/twilingway/piano-trainer/actions/runs/38456698780. Основной5190 сохранён, сервер
агент не запускал. Worktree .worktrees/reading-held-bass-p4b, ветка docs/reading-held-bass-p4b. На
этапе плана production и версия пакета не менялись.

## Указание пользователя

Пользователь: «продолжаем миди юбудем проверять после всех шагов. я подключу миди и ты будешь
гвоорить что куда кликнуть в каком из уроков».

Это разрешает продолжение roadmap и подготовку общего MIDI-сценария. Hardware отложена до
совместного прохода и не объявляется выполненной. Параметры P4b-3 затем подтверждены пользователем.

## Аудиты

Spec_architect: WAIT-first/current-fragment Song/one clock, lengths2/4, bass to musical end, full
retry/clock proof. Отвергнуто up-before-next: допустимо max2 RH без оценки артикуляции; early RH
определяется timestamp/clock, не callback. Explorer: ограничения wait/commitWaitingGroup/pair, seek
со сбросом stats, source/owner/sound/pedal. Это вошло в verified-onset API/current Song
reset/terminal gate с сохранностью прежних guards. Оба аудита read-only, production не менялся.

## Проверки

Независимый reviewer не нашёл критических противоречий после уточнения offset/rawEnd и готовности
между кадрами. Подтверждены один clock, current Song retry, отдельные guards2→1, terminal gate,
schema7 rollback и max2 RH. Кнопки MIDI-сценария сверены с src/ui. Дополнено явное различие
song.duration crossing и PracticeSession.finished с inputGrace: дополнительный grace не является
частью длительности баса. До подтверждения новых правил production не начинается.

`pnpm check` прошёл: format/lint/typecheck, 209 files passed/1 skipped,1946 tests passed/1 skipped,
5/5 test:compiler, production build. Это проверки неизменной production-базы, не нового курса.
`pnpm spec:validate`:47/47,0 failed. После замечаний менялись только Markdown-артефакты, scoped
format/spec проверки повторены; full test/build не повторялся без изменения production.

Документы опубликованы отдельной task-веткой в draft PR в dev. Главная папка остаётся на dev; новых
lesson кнопок до будущей реализации и merge нет. Аппаратные пункты остаются открытыми.
