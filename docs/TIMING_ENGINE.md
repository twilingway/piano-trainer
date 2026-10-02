# MIDI Piano Hero --- Timing Engine

## 1. Цель

Timing Engine отделяет реальную ошибку исполнения от задержки USB/Bluetooth MIDI, браузера и
аудиовывода.

Главный принцип: игрок оценивается за собственный timing, а не за latency оборудования.

## 2. Источники задержки

`Клавиша → пианино → USB/BLE MIDI → Android/OS → Browser → Web MIDI → Timing Engine`

Нужно измерять `Latency` (систематическую задержку) и `Jitter` (изменение задержки между событиями).

## 3. Единая шкала времени

Для browser high-resolution clock используется `performance.now()`. Для MIDI необходимо использовать
`MIDIMessageEvent.timeStamp`, а не `Date.now()` и не момент запуска callback.

```js
midiInput.onmidimessage = (event) => {
  processMidiEvent(event.data, event.timeStamp);
};
```

## 4. Input Offset

Для каждого MIDI Input хранится собственный Input Offset.

`CorrectedHitTime = MidiEventTime - InputOffset - ManualInputOffset`

`TimingError = CorrectedHitTime - ExpectedNoteTime`

Отрицательная ошибка = EARLY, положительная = LATE.

## 5. Judgement

После коррекции применяются окна игры:

    Timing Error Result

---

          ±30 ms PERFECT
          ±60 ms GREAT
         ±100 ms GOOD
         ±150 ms OK
      \> ±150 ms MISS

## 6. MIDI Input Calibration

Игра запускает метроном и просит нажимать одну клавишу, например C4. Рекомендуется 4 warm-up удара +
24 измеряемых.

Offset рассчитывается устойчивой статистикой, предпочтительно median, а не простым средним.

`InputOffset = median(samples)`

Явные человеческие ошибки должны отбрасываться как выбросы.

## 7. Jitter

Для устойчивой оценки разброса можно использовать Median Absolute Deviation:

`MAD = median(abs(sample - median(samples)))`

Ориентировочно: ≤3 ms Excellent, ≤7 Good, ≤15 Acceptable, \>15 Unstable.

Offset исправляет постоянную задержку, но не способен полностью исправить jitter.

## 8. Профили устройств

USB и Bluetooth одного пианино имеют отдельные профили. Сохраняются: device id/name, connection
type, inputOffsetMs, jitterMs, calibrationSamples и confidence.

При смене USB ↔ BLE нужна соответствующая калибровка.

## 9. Audio Offset

Audio latency хранится отдельно от MIDI Input Offset.

`MIDI Input Offset` компенсирует путь MIDI. `Audio Offset` компенсирует задержку услышанной музыки.
`Visual Offset` меняет только отображение. `Manual Timing Adjustment` позволяет пользователю вручную
довести ощущение синхронизации.

Bluetooth Audio может иметь намного большую задержку, чем BLE MIDI.

## 10. Rendering не является Clock

Нельзя считать song time количеством кадров или `setInterval()`.

Неправильно:

```js
songTime += 16.666;
noteY += speed;
```

Правильно:

```js
const songTime = performance.now() - songStartTime;
const timeUntilHit = note.time - songTime;
```

Положение ноты каждый кадр вычисляется из абсолютного времени. Просадка FPS не должна менять
judgement.

## 11. requestAnimationFrame

`requestAnimationFrame()` отвечает только за визуализацию. Hit Detection использует timestamp
MIDI-события и Master Timeline.

## 12. Web Audio

Для планирования аудио используется `audioContext.currentTime`. При старте сохраняется соответствие
clocks:

```js
const performanceStart = performance.now();
const audioStart = audioContext.currentTime;
```

Timing Engine должен уметь переводить Song Time между Audio Clock и Performance Clock.

## 13. MIDI Event Pipeline

`MIDI → event.timeStamp → Input Offset → Corrected MIDI Time → Note Matcher → Timing Error → Judgement → Score/Combo/Stats`

## 14. Note Matcher

При Note On ищется ближайшая ожидаемая нота той же MIDI-высоты только внутри максимального Match
Window, например ±150 ms. Если подходящей ноты нет --- `WRONG NOTE`.

## 15. Note On / Note Off

Note On с velocity \> 0 задаёт момент атаки. Note Off или Note On с velocity 0 задаёт отпускание.
Note Off используется для Hold и Release Accuracy.

Sustain CC64 также получает timestamp, но в стандартном режиме не меняет Note-On judgement.

## 16. Bluetooth и fairness

Высокий jitter не должен автоматически превращать PERFECT в огромное окно. Компенсируется постоянный
Offset; jitter измеряется и показывается пользователю.

Опциональный `Latency Assist` может немного расширять окна в casual-режиме, но Ranked Mode
использует фиксированные окна.

## 17. Ranked Mode

Ranked использует фиксированные Timing Windows, откалиброванные offsets, без динамической подстройки
во время песни, без Latency Assist и без изменения скорости.

Calibration не должна учиться на текущем исполнении и автоматически превращать систематические
ошибки игрока в PERFECT.

## 18. Diagnostics

Экран MIDI Diagnostics показывает Device, Type, Note, Velocity, Raw Timestamp, Corrected Timestamp,
Input Offset и Jitter.

Debug Mode дополнительно показывает: `Expected / Raw MIDI / Offset / Corrected / Error / Judgement`.

После песни полезен Timing Histogram, Average/Median Error и Early/Late%.

## 19. Конфигурация

```js
const timingConfig = {
  inputOffsetMs: 36,
  audioOffsetMs: 95,
  visualOffsetMs: 0,
  manualOffsetMs: -5,
  windows: {
    perfect: 30,
    great: 60,
    good: 100,
    ok: 150
  }
};
```

## 20. Архитектурные правила

1.  FPS никогда не определяет точность MIDI.
2.  Используется timestamp MIDI-события.
3.  USB и BLE имеют отдельные calibration profiles.
4.  MIDI latency и audio latency разделены.
5.  Visual Offset не изменяет judgement.
6.  Jitter нельзя полностью исправить Offset.
7.  Calibration не исправляет ошибки человека.
8.  Во время Ranked Run Input Offset фиксирован.
9.  Все подсистемы используют общий Master Timeline.
10. Score рассчитывается после компенсации системной задержки.

## 21. Итог

`RAW MIDI TIMESTAMP → - INPUT OFFSET → - MANUAL OFFSET → CORRECTED HIT TIME → - EXPECTED NOTE TIME → TIMING ERROR → PERFECT/GREAT/GOOD/OK/MISS`

Master Time является источником истины для Audio, Notes, MIDI, Rendering и Game Logic.
