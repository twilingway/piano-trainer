# Tasks

## 1. Контракт

- [ ] 1.1 Записать и провалидировать proposal/specs/design/tasks до production-кода; пройти spec
      review.
- [ ] 1.2 Уточнить конфликтующий диапазон активного song-led-beginner-course, не закрывая его пункт
      2.2.

## 2. Адаптивный экран

- [ ] 2.1 Реализовать временный responsive display-profile с независимым высотным бюджетом;
      unit/hook tests: граница 1024/1025, desktop 49/88, compact learner-only, восстановление
      настроек.
- [ ] 2.2 Реализовать компактную оболочку курса, короткую цель и доступное меню
      подробностей/скорости; component tests: все фазы, RU/EN, Escape/focus, отсутствие дублирующей
      общей панели.

## 3. Персонажи

- [ ] 3.1 Подготовить проверенную нейтральную позу учителя либо честный fallback без ложного
      нажатия; сохранить точные промпты/входы/QA, проверить тёмную и светлую подложки.
- [ ] 3.2 Добавить чистый mapper и тонкий канал персонажей; unit tests CDE, F, другой октавы/пальца,
      accompaniment, неверного ввода, release/pause/retry/stale callback.
- [ ] 3.3 Подключить guided-компаньонов neutral/correct/gentle-wrong и portrait-only учителя;
      использовать512×544 кадры teacher/sheets/, не исходники генераций; не менять written
      durations, independent/performance подсказки и оценку.

## 4. Проверка и публикация

- [ ] 4.1 Проверить ready/playing/hold/result в видимом браузере во всех шести viewport и при 200%
      zoom, доступность стана+клавиш, меню, поворот, reduced-motion и отказ рисунка; сохранить
      артефакты.
- [ ] 4.2 Пройти независимый review, `pnpm check` и `pnpm spec:validate`, затем открыть PR в dev.
