import type { Messages } from "./locales";

export const appMessages = {
  "Пианино-тренажёр": { en: "Piano Trainer" },
  "Рейтинг недоступен: выберите устройство и выполните актуальную калибровку в настройках синхронизации.":
    {
      en: "Ranking is unavailable: select a device and complete a current calibration in synchronization settings."
    },
  "Компьютерная клавиатура / экран": { en: "Computer keyboard / on-screen keys" },
  "Выберите одно MIDI-устройство": { en: "Select one MIDI device" },
  "Не удалось сохранить раскладку. Настройки действуют до перезагрузки страницы.": {
    en: "Could not save the layout. These settings apply until the page is reloaded."
  },
  "MIDI доступен только по https или на localhost — откройте http://localhost:5190": {
    en: "MIDI requires HTTPS or localhost — open http://localhost:5190"
  },
  "Этот браузер не поддерживает Web MIDI — откройте тренажёр в Chrome или Edge": {
    en: "This browser does not support Web MIDI — open the trainer in Chrome or Edge"
  },
  "В файле нет нот": { en: "The file contains no notes" },
  "Песни больше нет в библиотеке": { en: "The song is no longer in the library" },
  "Песни больше нет в папке": { en: "The song is no longer in the folder" },
  "Этот браузер не поддерживает полный экран для игры.": {
    en: "This browser does not support fullscreen for the game."
  },
  "Браузер не разрешил открыть игру на весь экран.": {
    en: "The browser did not allow the game to enter fullscreen."
  },
  "Браузер не разрешил свернуть полный экран.": {
    en: "The browser did not allow fullscreen to close."
  },
  "Не удалось загрузить словарь. Подготовьте ресурсы режима.": {
    en: "Could not load the dictionary. Prepare the mode's resources."
  },
  "В выбранной партии нет нот. Выберите другую партию или песню.": {
    en: "The selected part contains no notes. Choose another part or song."
  },
  "Ошибка генерации текста. Переключите режим и повторите.": {
    en: "Text generation failed. Switch modes and try again."
  },
  "Другой текст для этой партии подобрать не удалось.": {
    en: "Could not find different text for this part."
  },
  "Не удалось сохранить настройки режима.": { en: "Could not save the mode settings." },
  "Нужен файл .mid, .musicxml, .xml или .mxl": {
    en: "Choose a .mid, .musicxml, .xml or .mxl file"
  },
  "В архиве .mxl не найдена партитура": { en: "No score was found in the .mxl archive" },
  "Файл не похож на MusicXML": { en: "The file does not appear to be MusicXML" },
  "Поддерживается только MusicXML в виде score-partwise": {
    en: "Only score-partwise MusicXML is supported"
  },
  "Ошибка построения словесной раскладки": { en: "Could not build the word keyboard layout" },
  "Недостаточно клавиш для всех высот мелодии": {
    en: "There are not enough keys for all pitches in the melody"
  },
  "Неверный номер варианта текста": { en: "Invalid text variant number" },
  "Выбранная партия не содержит нот": { en: "The selected part contains no notes" },
  "В партии обнаружена некорректная нота": { en: "The part contains an invalid note" },
  "Не удалось построить текст для партии": { en: "Could not generate text for the part" },
  "Неверная настройка генератора: {key}": { en: "Invalid generator setting: {key}" },
  "Частота отрисовки игры": { en: "Game frame rate" },
  "Идеально!": { en: "Perfect!" },
  Отлично: { en: "Great" },
  Хорошо: { en: "Good" },
  Зачтено: { en: "OK" },
  Рано: { en: "Early" },
  Поздно: { en: "Late" },
  Мимо: { en: "Miss" },
  КОМБО: { en: "COMBO" },
  точность: { en: "accuracy" },
  "Поздно +{offset} мс": { en: "Late +{offset} ms" }
} satisfies Messages;
