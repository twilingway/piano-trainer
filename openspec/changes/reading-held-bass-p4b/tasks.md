# Tasks

## 1. План

- [x] 1.1 Аудит roadmap/P4b-2/clock/input/storage, proposal/specs/design со spec_architect и
      explorer.
- [x] 1.2 Общий MIDI-чеклист и пользовательское отложенное аппаратное тестирование.
- [x] 1.3 Независимое ревью плана, pnpm check/spec:validate, evidence и draft PR в dev.
- [x] 1.4 Подтвердить новые правила proposal перед production. Пользователь ответил «подтверждаю» на
      конкретный план PR159; аппаратная MIDI-приёмка по-прежнему отложена.

## 2. Генератор и сцена

- [x] 2.1 Held-bass types/generator10 (5×2/5×4, bass quota2), current MusicXML/Song и nextSeed;
      tests reading: длины/onset/duration/parsed IDs/диапазоны/seed и прежние генераторы.
- [x] 2.2 Current-fragment selection/fresh retry/same-seed replay; app tests с React Compiler:
      свежий Song, сохранность completed fragments, один clock. docs/HELD_BASS_READING.md.

## 3. Pure удержание

- [x] 3.1 HeldBassSession: initial200/201, continuous bass, ready RH order/max2 RH/legato/repeat;
      tests reading: обе длины, early/wrong/extra/mixed origin/pedal/up/full retry/no partial final.
- [x] 3.2 Bounded clock/input proof: tests reading/practice: age0/250/251/future, late early
      bass-up, frozen wait/end±1, 15/60 FPS, offsets/overflow/preheld/stale/cancel. Документировать
      границы.
- [x] 3.3 Results/help/progress; tests reading: whole-fragment independence/retry помощь/source
      filter/null medians, отдельность P2/coordination/history20. Документировать метрики.

## 4. PracticeSession и Trainer

- [x] 4.1 Scoped verified-onset commit2→1 и temporal receipts без ослабления pair guard; tests
      practice: exact IDs/time, paused/finished/stale/subset rejects без мутации, готовность между
      кадрами, единственный clock.
- [x] 4.2 Held policy/terminal gate до final release; tests Trainer: finished-before-release, late
      off/user pause/cancel/no take, ordinary/pair/rhythm regressions. Документировать shell.

## 5. UI и сохранение

- [x] 5.1 useHeldBassCourse/connected UI/receipts/stable XML/cursor; tests app/staff: current
      fragment/no future/hint leak/stale/preferences/compiled replay. App остаётся композицией.
- [x] 5.2 RU/EN карточка/знакомство/статусы/история; tests UI: bindings/max2 RH/early/mouse/help;
      видимый desktop/320×568/390×844/667×375/settings. Обновить пользовательскую документацию.
- [x] 5.3 Schema7/heldBass/migrations1–6/strict validator; tests persistence/repository: malformed
      trace/generator/version, dedupe/history20/siblings/legacy/P2/reload incomplete, concurrent
      tabs/late hydrate/abort/quota/future/corrupt/rollback6. docs/HELD_BASS_PERSISTENCE.md.

## 6. Доставка и приёмка

- [x] 6.1 Reviewer реализации, narrow suites, pnpm check и pnpm spec:validate, точное evidence.
- [x] 6.2 Видимый Chrome: full10 fragments2/4, retry after RH, bass/end/frozen wait/help/повтор/
      reload/exit/RU/EN/mobile/settings; screenshots/console, hardware отдельно.
- [x] 6.3 Task PR в dev; после user merge ff-only обновить основной5190, проверить SHA/CI/served
      files без запуска сервера.
- [ ] 6.4 После всех шагов совместная hardware-приёмка по docs/MIDI_COURSE_ACCEPTANCE.md:
      пользователь подключает MIDI, агент даёт по одному клику/нажатию и сверяет ответ. До этого
      hardware «не проверено», не blocker следующих согласованных этапов; change не архивировать.
