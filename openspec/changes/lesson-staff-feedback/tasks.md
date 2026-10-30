# Задачи

## 1. Контракт и эффективный профиль

- [ ] 1.1 Реализовать общий receipt/source с dedupe и lifecycle без replay, React/DOM/timers;
      meaningful тесты дубликатов, run/presentation isolation, stale identity, нескольких notes и
      отказа listener.
- [ ] 1.2 Выключить три игровых FX только в effective readingDisplayProfile; тесты всех
      practiceActive веток, базовая подсветка остаётся, исходные/saved prefs и выход из урока
      сохраняются.

## 2. Подтверждённые результаты

- [ ] 2.1 Подключить чтение RH/LH, интервалы и ритм к source; по каждому положительный и
      отрицательный тесты accepted/wrong/blocked/stale/hint/auto.
- [ ] 2.2 Подключить две руки и удерживаемый бас; тесты partial/rejected/accepted, старого
      presentation и только нового onset без ложного завершения удержания.
- [ ] 2.3 Подключить независимые ритмы; тесты нового hit, phase/run isolation, no duplicate/held
      callbacks.
- [ ] 2.4 Подключить музыкальный курс input и frame-accepted chords; тесты first/partial press→none,
      accepted chord→все целевые heads, без accompaniment/preview и неверного результата.

## 3. Отображение и проводка

- [ ] 3.1 Реализовать отдельный overlay-owner на существующих head anchors; DOM-тест захвата до XML
      replacement, сохранения короткого эффекта после replacement, очистки ошибки/hidden/unmount.
- [ ] 3.2 Прокинуть стабильный source через usePlayerRuntime/ConnectedPracticeWorkspace/Workspace в
      основной Staff; tests presentation gating, repeated pitch with new noteId, no feedback на
      take/review/скрытом стане; Staff.tsx остаётся до 500 строк.
- [ ] 3.3 Добавить короткую вспышку и reduced-motion статическое выделение без layout impact;
      тесты/браузер подтверждают pointer/focus и отсутствие геометрического сдвига.

## 4. Приёмка

- [ ] 4.1 В видимом браузере проверить чтение RH/LH, две руки/аккорд, held bass, independent rhythm,
      интервалы, ритм и музыкальный курс; desktop/320×568/390×844/667×375, короткие начала, no key
      sparks и exit restoration.
- [ ] 4.2 Независимое ревью всех адаптеров и overlay, `pnpm check`, `pnpm spec:validate`, отдельный
      PR в dev без merge; свой сервер остановлен.
