## 1. Что горит

- [x] 1.1 `src/practice/keyLights.ts`: `keyLightPitches(session, active)`; тесты: режим ожидания
      (аккорд, нажатая нота гаснет), режим темпа (окно 300 мс, промах гаснет), повтор высоты, чужая
      рука, `active = false`. Проверка: `pnpm exec vitest run src/practice/keyLights.test.ts`
- [x] 1.2 `Trainer.onLights`: вызов в кадре и пустой набор в `silence()`; учёт Performance. Тесты:
      пауза, перемотка и конец песни шлют пустой набор. Проверка:
      `pnpm exec vitest run src/practice/Trainer.test.ts`

## 2. Отправка и эхо

- [x] 2.1 `parseMidiMessage` даёт `channel` 1–16. Проверка:
      `pnpm exec vitest run src/input/midiInput.test.ts`
- [x] 2.2 `MidiOutputControl.send`. Проверка: `pnpm exec vitest run src/input/midiOutput.test.ts`
- [x] 2.3 `src/input/keyLights.ts`: разница наборов, `configure` гасит на прежнем канале, `forget`,
      `isEcho` по каналу и по совпадению в 30 мс с громкостью, выключенная подсветка молчит и не
      фильтрует. Проверка: `pnpm exec vitest run src/input/keyLights.test.ts`

## 3. Настройки и связка

- [x] 3.1 `src/app/keyLightPreferences.ts` (`key-lights-v1`, откат по полям). Проверка: тест на
      повреждённое и выходящее за пределы значение
- [x] 3.2 `useMidiOutput(trainerRef, trainerReady)`: `KeyLights`, `onLights`, `forget` при смене
      порта; `useKeyInput` отбрасывает эхо; `App.tsx` передаёт `trainerReady`. Проверка: тест хука
      на подставном `MIDIAccess` — подсветка доходит до порта, эхо не доходит до тренажёра
- [x] 3.3 `MidiSettings`: флажок, канал, громкость, предупреждение при канале 1, переводы. Проверка:
      тест `MidiSettings`

## 4. Завершение

- [x] 4.1 `pnpm check` и `pnpm spec:validate` зелёные
- [ ] 4.2 Ручной прогон loopMIDI + MIDI-OX: подсветка в обоих режимах, гашение при паузе и
      перемотке, эхо через петлю loopMIDI не засчитывается
