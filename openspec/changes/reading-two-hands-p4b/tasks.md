# Tasks

## 1. План и согласование

- [x] 1.1 Проверить roadmap и существующие input/session/persistence; подготовить proposal, specs и
      design с read-only spec_architect и explorer аудитами.
- [x] 1.2 Провести независимое ревью, pnpm check и pnpm spec:validate; записать evidence в
      verification.md и открыть draft PR плана в dev.
- [x] 1.3 Получить подтверждение конкретных решений proposal; записать ответ пользователя в
      verification.md. Production групп 2–7 до подтверждения не начинать.

## 2. Генератор и парная нотация

- [ ] 2.1 Добавить отдельные типы и seeded генератор десяти пар; pnpm exec vitest run src/reading
      проверяет квоты/повтор/новый seed/no duplicate neighbours, XML/Song с двумя партиями, 20
      нот/10 onset и отсутствие регрессии прежних seed. Описать в docs/TWO_HAND_READING.md.
- [ ] 2.2 Добавить текущую парную XML-проекцию; tests staff/reading подтверждают два clef/staves,
      отсутствие будущих нот/имён/пальцев, совпадающий onset и cursor. Документировать предъявление.

## 3. Чистый парный оценщик и метрики

- [ ] 3.1 Реализовать TwoHandSession с fresh/down/up, full-release и atomic outcome; pnpm exec
      vitest run src/reading проверяет обе очередности, 200/201 мс, неверную октаву, early off,
      третью ноту до release, repeat, mixed source/channel/pedal и все десять пар. Описать учебное
      окно/финализацию и отсутствие оценки физических рук в документации.
- [ ] 3.2 Добавить bounded журнал timestamps и lifecycle; tests reading проверяют age0/250/251,
      future, out-of-order off/down, deadline/watermark границы, 15/60 FPS, pause/hidden/retry,
      старый run/off и overflow без ложного успеха. Документировать отмену/время активных
      интервалов.
- [ ] 3.3 Добавить квитанции помощи, результаты и отдельную сводку; tests reading проверяют
      after-error/after-help, первую самостоятельную пару, медианы/null, source filter со всей
      историей и неизменность P2 profile. Документировать измерения и окно двадцати серий.

## 4. Runtime и реальные события

- [ ] 4.1 Подключить bounded pair-policy down/up до обычного judgement и pure atomic commit
      актуальной группы PracticeSession; pnpm exec vitest run src/practice проверяет отсутствие
      частичного hit, одно продвижение/commit, stale callback и сохранность ordinary wait/chords,
      P1/баса/интервалов/ритма. Обновить документацию интеграции/единственного clock.
- [ ] 4.2 Добавить отдельный useTwoHandCourse/connected runtime без расширения App-логики; tests app
      проверяют real presentation receipt, feedback, release status, pause/hidden/exit, отсутствие
      обычного take/accompaniment и восстановление предпочтений. Документировать lifecycle.

## 5. Мультитач

- [ ] 5.1 Провести pointer identity/timestamp по binder, активным KeyboardLayer/FallingNotesView и
      shell; tests render/input/practice проверяют два указателя, одну высоту с двумя владельцами,
      cancel/outside/blur/hidden/cleanup после preliminary без ложного commit, реальный upoutside,
      flat/road/drag и отсутствие двойных down. Документировать доступность touch и ограничение
      одиночной мыши.
- [ ] 5.2 Подключить C3–G4 и объяснение обычных bindings; tests app/render подтверждают доступ двух
      диапазонов, custom bindings/октавы без remap и отсутствие автозащёлки. Обновить
      docs/TWO_HAND_READING.md инструкцией MIDI/ПК/двух касаний.

## 6. Сохранение и интерфейс

- [ ] 6.1 Добавить schema6/coordination, строгую проверку generator/evidence и atomic merge; tests
      migration/persistence проверяют v1–v6/siblings, late hydrate, runId, две вкладки, лимит20,
      corrupt/future/quota/abort, старую вкладку и reload incomplete. Описать миграцию/rollback.
- [ ] 6.2 Добавить карточку/знакомство/пару/помощь/историю RU/EN; tests UI/hook проверяют оба языка,
      no-MIDI/mouse-only сообщения, актуальные назначения, текущую помощь без leak и понятные
      причины ошибок. Документация содержит пользовательский путь и ограничения.

## 7. Интеграция и приёмка

- [ ] 7.1 Провести reviewer реализации, pnpm check и pnpm spec:validate; сохранить результаты и
      регрессии остальных курсов/обычной игры в verification.md.
- [ ] 7.2 Открыть PR реализации в dev; после пользовательского merge ff-only обновить основную папку
      и проверить commit/CI/актуальные файлы прежнего 5190 без запуска сервера.
- [ ] 7.3 Проверить видимый Chrome: полный проход10пар, ошибки/third note/release/помощь, смена
      источника между попытками, pause/reload/exit, RU/EN, desktop/320×568/390×844/667×375, экранный
      flat/road и обычная two-hand игра. Сохранить screenshots/события/console evidence.
- [ ] 7.4 Отдельно принять физическое MIDI/ПК/мультитач, реальную слышимость и реальный hidden;
      синтетические события не объявлять аппаратной приёмкой, открытые случаи назвать явно.
