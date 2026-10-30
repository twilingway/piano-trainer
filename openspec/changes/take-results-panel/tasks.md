## 1. Short summary and the stats panel

- [x] 1.1 `ResultStats`: the details block and histogram moved out of `ResultDialog` into a
      non-modal `GameDialog` with close, «Ещё раз» and «Разобрать дубль»
- [x] 1.2 `ResultDialog`: summary, trouble notes and actions only; «Статистика» when there are notes
      to rate
- [x] 1.3 `ConnectedPlayerWindows`: «Статистика» closes «Готово» and opens the panel with a copy of
      the finished stats; the copy is cleared by close, «Ещё раз», the next task, a song change and
      a new run outside comparing
- [x] 1.4 Styles: the panel beside the game like «Настройки», full screen at `width <= 640px`
- [x] 1.5 Strings: «Статистика» and the panel title in the locale tables

## 2. Review on phones

- [x] 2.1 At `width <= 640px` hide «Разобрать дубль» and the review bar

## 3. Verification

- [x] 3.1 Tests: short summary without the details; «Статистика» absent with nothing to rate; the
      panel shows the copied stats and closes on «Ещё раз»; the panel keeps its numbers while
      comparing
- [x] 3.2 `pnpm check` and `pnpm spec:validate`
- [x] 3.3 Browser on the task stand: 1920×1080 «Готово» without scroll, panel beside the review;
      360×640 no review, panel full screen

## 4. Доставка пропущенной мобильной доработки

- [x] 4.1 Перенести ранее согласованный коммит `1a48c38`: трудные ноты видны в панели на телефонах;
      профильный тест `pnpm exec vitest run src/ui/GameBoard.test.tsx` проверяет содержимое.
- [x] 4.2 Выполнить `pnpm check` и `pnpm spec:validate`, записать результаты и передать ветку на
      независимое ревью.
- [x] 4.3 Проверить в браузере: до 640 px трудные ноты в «Статистике», на широком экране остаются в
      «Готово»; открыть отдельный PR в dev без слияния.

- [x] 4.4 Исправить замечания ревью: доступность трудных нот на низком сенсорном экране и английские
      названия нот; проверить RU/EN regression test и браузер на 667×375.
