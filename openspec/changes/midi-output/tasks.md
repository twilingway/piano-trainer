## 1. Выход

- [x] 1.1 `src/input/midiOutput.ts`: `findOutput`, `panicMessages`, `openMidiOutput` с `select`,
      `test`, `dispose`, `statechange` и `pagehide`; тесты на подставном `MIDIAccess`: выбор по id и
      по имени, отключение и возврат, паника на прежний порт при смене и `dispose`, паника на
      `pagehide`, отключённый порт не бросает, проверочная нота с отложенным Note Off. Проверка:
      `pnpm exec vitest run src/input/midiOutput.test.ts`
- [x] 1.2 `src/app/midiOutputPreferences.ts`: `midi-output-v1` с откатом к «Нет». Проверка: тест на
      повреждённое значение

## 2. Настройки

- [x] 2.1 `useMidiOutput` и блок «Выход MIDI» с «Проверить» в разделе «Пианино»; строка «нет связи»;
      переводы. Проверка: тест `MidiSettings` на список, «нет связи» и недоступную кнопку

## 3. Завершение

- [x] 3.1 `pnpm check` и `pnpm spec:validate` зелёные
- [ ] 3.2 Ручной прогон loopMIDI + MIDI-OX: выбор, «Проверить», паника при смене выхода и закрытии
      вкладки, переподключение порта. Отметить, что настоящее пианино не проверено
