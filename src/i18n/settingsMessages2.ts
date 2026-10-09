import type { Messages } from "./locales";

export const settingsMessages2 = {
  Мельче: {
    en: "Zoom out"
  },
  Крупнее: {
    en: "Zoom in"
  },
  "По строкам": {
    en: "Multiple lines"
  },
  "Цвет нот": {
    en: "Note color"
  },
  "Цвет партитуры": {
    en: "Score color"
  },
  "Следовать за игрой": {
    en: "Follow playback"
  },
  "Тактов в строке": {
    en: "Measures per line"
  },
  Авто: {
    en: "Auto"
  },
  "По 2 такта": {
    en: "2 measures"
  },
  "По 4 такта": {
    en: "4 measures"
  },
  "По 8 тактов": {
    en: "8 measures"
  },
  "Названия на нотах": {
    en: "Names on notes"
  },
  Нет: {
    en: "None"
  },
  "Номера пальцев": {
    en: "Finger numbers"
  },
  Аккорды: {
    en: "Chords"
  },
  "Цвет номеров пальцев": {
    en: "Finger-number colors"
  },
  Одноцветные: {
    en: "Single color"
  },
  "По цветам пальцев": {
    en: "By finger color"
  },
  "Точность и калибровка": {
    en: "Accuracy and calibration"
  },
  "Поправки действуют со следующего исполнения — нажмите «Сначала».": {
    en: "Offsets take effect on the next take — press “Restart”."
  },
  "Устройство:": {
    en: "Device:"
  },
  Подключение: {
    en: "Connection"
  },
  "Клавиатура / экран": {
    en: "Keyboard / screen"
  },
  "Название аудиовыхода": {
    en: "Audio output name"
  },
  "Например, «наушники» или «Bluetooth-колонка». Это только подпись профиля: звук в браузере она не переключает.":
    {
      en: "For example, “headphones” or “Bluetooth speaker”. It only labels the profile and doesn't switch the browser's audio output."
    },
  "Это подключение ещё не калибровали, поправка ввода — 0 мс.": {
    en: "This connection isn't calibrated yet; input offset is 0 ms."
  },
  "Откалибруйте заново: замер неполный или нестабильный, либо сменился аудиовыход или задержка звука.":
    {
      en: "Calibrate again: the reading is incomplete or unstable, or the audio output or delay has changed."
    },
  "Нажимайте до первой октавы (C4) в такт метроному: 4 удара на разминку, затем 24 замера. В замер входят ваша реакция и задержка звука, а не только MIDI-устройство.":
    {
      en: "Press middle C (C4) in time with the metronome: 4 warm-up beats, then 24 measurements. The result includes your reaction and audio delay, not just the MIDI device."
    },
  "Отменить калибровку": {
    en: "Cancel calibration"
  },
  "Калибровать C4": {
    en: "Calibrate C4"
  },
  " · Готово": {
    en: " · Done"
  },
  " · Не завершено — повторите": {
    en: " · Incomplete — try again"
  },
  "Во время рейтинговой игры настройки заблокированы.": {
    en: "Settings are locked during ranked play."
  },
  "Выберите одно MIDI-устройство в разделе «Пианино» — тогда его можно откалибровать и играть на рейтинг.":
    {
      en: "Pick one MIDI device under “Piano” to calibrate it and unlock ranked play."
    },
  "Диагностика ввода": {
    en: "Input diagnostics"
  },
  "мс · Corrected": {
    en: "ms · Corrected"
  },
  "мс · Jitter": {
    en: "ms · Jitter"
  },
  "Событие вне активной шкалы времени или просрочено.": {
    en: "The event is outside the active timeline or has expired."
  },
  "Правила и очки": {
    en: "Rules and score"
  },
  Сложность: {
    en: "Difficulty"
  },
  Легко: {
    en: "Easy"
  },
  Обычно: {
    en: "Normal"
  },
  Сложно: {
    en: "Hard"
  },
  Эксперт: {
    en: "Expert"
  },
  "Рейтинговая игра": {
    en: "Ranked play"
  },
  "В «Печатать мелодию» рейтинга нет: это учебный режим.": {
    en: "Type the Melody is a practice mode with no ranking."
  },
  "Для рейтинга выберите одно устройство и откалибруйте его в разделе «Синхронизация». Рейтинговая игра идёт в темпе, на скорости 100 % и без повтора участка.":
    {
      en: "To play ranked, pick one device and calibrate it under “Synchronization”. Ranked play runs in tempo at 100% speed, with no section looping."
    },
  "Учебное окно +300 мс": {
    en: "Learning window +300 ms"
  },
  "Нажатие с опозданием до 300 мс засчитывается и даёт 25 очков, точное попадание стоит больше. Клавиша начинает подсвечиваться за 300 мс до ноты. В рейтинге окно всегда строгое.":
    {
      en: "A press up to 300 ms late counts as OK for 25 points; an accurate hit is worth more. The key starts lighting up 300 ms before the note. Ranked play always uses the strict window."
    },
  "Без подсказок": {
    en: "Hide hints"
  },
  "Остановиться после ошибки": {
    en: "Stop on a mistake"
  },
  "После промаха или лишней ноты игра встаёт на паузу.": {
    en: "The game pauses after a miss or an extra note."
  },
  "Песня не останавливается на ошибках.": {
    en: "The song keeps going through mistakes."
  },
  "Участок, секунды": {
    en: "Section, seconds"
  },
  От: {
    en: "From"
  },
  До: {
    en: "To"
  },
  "Повторять участок": {
    en: "Loop section"
  },
  "Как считаются очки": {
    en: "How scoring works"
  },
  "«Идеально» / «Отлично» / «Хорошо» / «Зачтено»: 100 / 80 / 50 / 25 очков. Комбо поднимает множитель до ×5, ошибка сбрасывает комбо. Лишняя клавиша между нотами не штрафуется.":
    {
      en: "Perfect / Great / Good / OK: 100 / 80 / 50 / 25 base points. A combo raises the multiplier up to ×5; a mistake resets it. A stray key between notes isn't penalized."
    },
  "20 нот подряд на «Идеально» или «Отлично» включают Поток. Каждая засчитанная нота, даже «Хорошо» и «Зачтено», добавляет энергию. Её запас зависит от длины выбранной партии: в пьесе короче 30 секунд хватит на два Overdrive, в более длинной — на три. Промахи и паузы энергию не дают. Overdrive стоит 50 энергии и удваивает множитель на 10 секунд, поэтому в совсем коротком упражнении включений может быть меньше. За удержание длинных нот начисляются бонусные очки.":
    {
      en: "20 Perfect or Great hits in a row start Flow. Every scored note, even Good and OK, adds energy. The total depends on the length of the selected part: enough for two Overdrives in a piece under 30 seconds, three in a longer one. Misses and rests add no energy. Overdrive costs 50 energy and doubles the multiplier for 10 seconds, so a very short exercise may allow fewer activations. Holding long notes earns bonus points."
    },
  "В пианино звёзды даются за общий результат: 30% за попадания и 70% за удержание. От 25% — одна звезда, от 50% — две, от 75% — три. Точность попадания и ранг времени считаются отдельно. В печати слов звёзды зависят от точности.":
    {
      en: "Piano stars use the overall result: 30% for hits and 70% for holding. At least 25% earns one star, 50% two, and 75% three. Hit timing accuracy and timing rank are separate. Word typing stars depend on accuracy."
    },
  "Язык текста": {
    en: "Text language"
  },
  Русский: {
    en: "Russian"
  },
  Партия: {
    en: "Part"
  },
  "Партия для печати": {
    en: "Typing part"
  },
  Мелодия: {
    en: "Melody"
  },
  Бас: {
    en: "Bass"
  },
  "На слово: буква привязана к ноте только внутри слова, поэтому слова получаются длиннее": {
    en: "Per word: a letter maps to a note only within its word, so the words come out longer"
  },
  Раскладка: {
    en: "Layout"
  },
  "Раскладка букв": {
    en: "Letter layout"
  },
  "На слово": {
    en: "Per word"
  },
  "На песню": {
    en: "Per song"
  },
  "Другие слова": {
    en: "Other words"
  },
  "Вторую руку играет программа, пока вы печатаете свою партию": {
    en: "The app plays the other hand while you type your part"
  },
  "Аккомпанемент второй руки": {
    en: "Other-hand accompaniment"
  },
  "Разделы настроек": {
    en: "Settings sections"
  },
  "Раздел настроек": {
    en: "Settings section"
  },
  "Нотный стан": {
    en: "Staff"
  },
  "Скрыть нотный стан": {
    en: "Hide staff"
  },
  "Показать нотный стан": {
    en: "Show staff"
  },
  "Падающие ноты": {
    en: "Falling notes"
  },
  "Скрыть падающие ноты": {
    en: "Hide falling notes"
  },
  "Показать падающие ноты": {
    en: "Show falling notes"
  },
  Клавиатура: {
    en: "Keyboard"
  },
  "Скрыть клавиатуру": {
    en: "Hide keyboard"
  },
  "Показать клавиатуру": {
    en: "Show keyboard"
  },
  "Скрыть руки": {
    en: "Hide hands"
  },
  "Показать руки": {
    en: "Show hands"
  },
  Дорога: {
    en: "Road"
  },
  "Обычный вид нот": {
    en: "Standard note view"
  },
  "Дорога: ноты в перспективе": {
    en: "Road: notes in perspective"
  },
  "Ноты на стане": {
    en: "Note cards"
  }
} satisfies Messages;
