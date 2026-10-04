# Tasks

## 1. Пальцы слепой печати

- [x] 1.1 `src/wordTyping/touchTyping.ts` с таблицей клавиша → рука и палец; тест: все клавиши
      клавиатуры режима имеют палец, `KeyL` — правый безымянный, `Digit6` — правый указательный,
      `KeyA` — левый мизинец
- [ ] 1.2 Клавиши автоматической клавиатуры окрашены цветом пальца, текущая — ярче; проверка
      `pnpm typecheck` и глазами

## 2. Общий вид

- [x] 2.1 `keyboardRows.ts` (колонка на клавишу), `laneSong.ts` (колонки, настоящая высота,
      партитура); тесты `keyboardRows.test.ts`, `laneSong.test.ts`
- [x] 2.2 `computerKeyboardLayout.ts` и `computerKeys.ts` (перевод кадра, мышь, цвета); тесты
      `computerKeyboardLayout.test.ts`, `computerKeys.test.ts`
- [x] 2.3 `ComputerKeyboardLayer.ts`, `FallingNotesView.setComputerKeys`, `NotesLayer` с настоящей
      высотой для карточек; `useFallingView`/`App`; удалены `WordLaneView`, `WordTypingLane`,
      HTML-клавиатура и `useWordTypingPointer`; проверка `pnpm check`
- [ ] 2.4 Глазами: плоский вид, дорога, перспектива, карточки, подписи клавиш, мышь, ожидание,
      перезапуск, ресайз

## 3. Экран

- [x] 3.0 Палитра `TYPING_FINGER_COLOR` (указательные по руке, средние фиолетовые) и зоны цифрового
      ряда по русской схеме; тесты `fingerColors.test.ts`, `touchTyping.test.ts`
- [x] 3.0a Подсветка заранее: ожидаемая клавиша по кадру трейнера, следующая — слабее; проверка
      `pnpm check`, глазами — в 2.4
- [ ] 3.1 Строка над видом: текст мельче, легенда, звёзды качества; убраны заголовок, пояснения и
      строка текущей ноты; проверка `pnpm check` и глазами

## 4. Аккомпанемент

- [x] 4.0 `withAccompaniment` в `src/wordTyping/extractLine.ts`, флаг в настройках режима с
      сохранением, галочка в полосе настроек; тесты `wordTyping.test.ts`,
      `wordTypingPreferences.test.ts`

## 5. Интеграция

- [x] 5.1 `pnpm check` и `pnpm spec:validate` зелёные
