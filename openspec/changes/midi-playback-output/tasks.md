# Tasks

## 1. Настройки

- [x] 1.1 Добавить сохранённый mode/channel, RU/EN интерфейс и состояния нет связи/конфликт каналов.
      Проверка: тесты persistence и MidiSettings.
- [x] 1.2 Связать ConnectedSettings с командами режима/канала. Проверка: TypeScript и тесты панели.

## 2. MIDI-звучание

- [x] 2.1 Добавить отменяемую очередь MIDI note on/off с учётом перекрытий и echo. Проверка:
      fake-timer тесты pause/reset, velocity, overlap и echo.
- [x] 2.2 Подключить маршрут к SessionAudio и Trainer без нового clock и потери позиции. Проверка:
      sessionAudio тесты трёх режимов, ожидания, компенсации и восстановления.
- [x] 2.3 Подключить существующий MIDI-выход, cleanup и reconnect. Проверка: useMidiOutput
      интеграционные тесты и существующие тесты подсказок.

## 3. Приёмка

- [x] 3.1 Проверить панель RU/EN в браузере; реальные звук/BTLE отметить отдельно, если устройства
      нет.
- [ ] 3.2 Выполнить reviewer, pnpm check, pnpm spec:validate; открыть PR в dev.
