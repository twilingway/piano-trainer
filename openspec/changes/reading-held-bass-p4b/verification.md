# Проверка плана P4b-3

## Подтверждение реализации

После публикации draft PR159 пользователь ответил «подтверждаю» на конкретные правила proposal. Это
разрешает production:10 фрагментов2/4, WAIT120, бас до музыкального конца, full retry, max2 RH
legato и early readiness error. Аппаратная MIDI-приёмка остаётся после всех шагов. Все planning
artifacts готовы и spec47/47 пройден до начала реализации.

## База

Чистый dev d863da148c151403182bbac0070ca679e1228265 после merge#158, CI success:
https://github.com/twilingway/piano-trainer/actions/runs/38456698780. Основной5190 сохранён, сервер
агент не запускал. Worktree .worktrees/reading-held-bass-p4b, ветка docs/reading-held-bass-p4b.
Production и версия пакета пока не менялись.

## Указание пользователя

Пользователь: «продолжаем миди юбудем проверять после всех шагов. я подключу миди и ты будешь
гвоорить что куда кликнуть в каком из уроков».

Это разрешает продолжение roadmap и подготовку общего MIDI-сценария. Hardware отложена до
совместного прохода и не объявляется выполненной. Новые параметры P4b-3 ждут подтверждения proposal.

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
