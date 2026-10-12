# Tasks

## 1. Согласование

- [x] 1.1 Проверить текущий dev, roadmap, clock/input/audio/storage и независимый аудит; записать
      ограничения в design.md, проверить конкретные acceptance сценарии.
- [x] 1.2 Согласовать первый срез и schema 4; записать подтверждение в verification.md. До этого
      production-код групп 2–6 не начинать.

## 2. Чистое ядро

- [x] 2.1 Реализовать seed/XML/Song генератор; pnpm exec vitest run src/rhythm проверяет квоты, 4/4,
      хвостовые паузы и воспроизводимость. Описать рисунок в docs/RHYTHM_TRAINING.md.
- [x] 2.2 Реализовать matching/extra/rest/miss/identity и метрики; тесты src/rhythm проверяют ±150,
      ±151, rest boundary, repeated half, grace/offset, отсутствие данных. Описать метрики.

## 3. Clock, звук и ввод

- [x] 3.1 Добавить профиль tempo и countInBeats в PracticeSession/SessionAudio; тесты practice/audio
      проверяют 4 beats при 60/80/100, silent tail, 15/60 FPS и сохранение defaults обычной песни;
      документировать отсчёт и grace.
- [x] 3.2 Подключить observer всех свежих атак и raw/corrected snapshot; тесты Trainer/input
      проверяют MIDI/Space/Tap, duplicate down, release, чужой источник, stale raw и форму/shortcut.
      Документировать игнорирование высоты и удержания.
- [x] 3.3 Добавить readiness и отмену при pause/hidden/окне/audio suspend; hook/audio тесты
      проверяют старые callbacks, отсутствие ложных пропусков и ручной повтор с новым runId;
      документировать прерывания.

## 4. Сохранение

- [x] 4.1 Расширить schema 4 и atomic merge; тесты persistence/migration проверяют v1–v4, две
      вкладки, late hydrate, duplicate runId, 20-result cap, corrupt/future/abort и неизменность
      P2/P3. Описать reload/rollback в docs/RHYTHM_TRAINING.md.

## 5. Интерфейс

- [x] 5.1 Добавить курс, источник/BPM/старт/тап/повтор, отдельные сводки и RU/EN; UI/hook тесты
      проверяют доступ без MIDI, Tab/Space/Enter, no double tap, empty deviation и отмену при
      выборе. Документировать управление и ограничения метрик.

## 6. Интеграция и доставка

- [x] 6.1 Провести reviewer-ревью и исправить замечания; pnpm check и pnpm spec:validate зелёные,
      verification.md фиксирует регрессии обычной практики/P1/P2/P3.
- [ ] 6.2 Опубликовать PR в dev; после пользовательского merge ff-only обновить основную папку,
      подтвердить актуальные файлы на пользовательском 5190. Сервер не запускать/перезапускать.
- [ ] 6.3 Проверить visible Chrome: полная серия, rest/extra/miss, повтор/hidden/пауза, reload,
      RU/EN и desktop/320×568/390×844/667×375; сохранить снимки и доказательства. Физическую
      слышимость и реальное MIDI проверять отдельно, открытые пункты назвать явно.
