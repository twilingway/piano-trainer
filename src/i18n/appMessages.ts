import type { Messages } from "./locales";

export const appMessages = {
  Нотопад: { en: "Twiling Keys" },
  "Рейтинг недоступен: выберите одно устройство и откалибруйте его в разделе «Синхронизация».": {
    en: "Ranked play is unavailable: pick one device and calibrate it under “Synchronization”."
  },
  "Компьютерная клавиатура / экран": { en: "Computer keyboard / on-screen keys" },
  "Выберите одно MIDI-устройство": { en: "Select one MIDI device" },
  "Не удалось сохранить раскладку: после перезагрузки страницы она сбросится.": {
    en: "Couldn't save the layout: it will reset when the page reloads."
  },
  "MIDI работает только по HTTPS или на localhost — откройте http://localhost:5190": {
    en: "MIDI only works over HTTPS or on localhost — open http://localhost:5190"
  },
  "Этот браузер не поддерживает Web MIDI — откройте тренажёр в Chrome или Edge": {
    en: "This browser does not support Web MIDI — open the trainer in Chrome or Edge"
  },
  "В файле нет нот": { en: "The file contains no notes" },
  "Песни больше нет в библиотеке": { en: "The song is no longer in the library" },
  "Песни больше нет в папке": { en: "The song is no longer in the folder" },
  "Браузер не поддерживает полноэкранный режим.": {
    en: "This browser doesn't support fullscreen."
  },
  "Браузер не разрешил открыть игру на весь экран.": {
    en: "The browser didn't allow fullscreen."
  },
  "Браузер не разрешил выйти из полноэкранного режима.": {
    en: "The browser didn't allow leaving fullscreen."
  },
  "Не удалось загрузить словарь для этого режима.": {
    en: "Couldn't load the dictionary for this mode."
  },
  "В выбранной партии нет нот. Выберите другую партию или песню.": {
    en: "The selected part has no notes. Pick another part or song."
  },
  "Не получилось подобрать текст. Переключите режим и попробуйте ещё раз.": {
    en: "Couldn't build the text. Switch modes and try again."
  },
  "Других слов для этой партии не нашлось.": {
    en: "No other words fit this part."
  },
  "Не удалось сохранить настройки режима.": { en: "Couldn't save the mode settings." },
  "Нужен файл .mid, .musicxml, .xml или .mxl": {
    en: "Choose a .mid, .musicxml, .xml or .mxl file"
  },
  "В архиве .mxl нет партитуры": { en: "The .mxl archive has no score" },
  "Файл не похож на MusicXML": { en: "This file doesn't look like MusicXML" },
  "Поддерживается только MusicXML в виде score-partwise": {
    en: "Only score-partwise MusicXML is supported"
  },
  "Не удалось разложить мелодию по буквам": { en: "Couldn't map the melody to letters" },
  "Не хватает клавиш на все ноты мелодии": {
    en: "Not enough keys for every pitch in the melody"
  },
  "Неверный номер варианта текста": { en: "Invalid text variant number" },
  "В выбранной партии нет нот": { en: "The selected part has no notes" },
  "В партии есть некорректная нота": { en: "The part has an invalid note" },
  "Не удалось подобрать текст для партии": { en: "Couldn't build text for this part" },
  "Неверная настройка генератора: {key}": { en: "Invalid generator setting: {key}" },
  "Кадров в секунду": { en: "Frames per second" },
  "Идеально!": { en: "Perfect!" },
  Отлично: { en: "Great" },
  Хорошо: { en: "Good" },
  Зачтено: { en: "OK" },
  Рано: { en: "Early" },
  Поздно: { en: "Late" },
  Мимо: { en: "Miss" },
  КОМБО: { en: "COMBO" },
  точность: { en: "accuracy" },
  "Поздно +{offset} мс": { en: "Late +{offset} ms" },
  "Не удалось прочитать или сохранить часть данных. Изменения доступны до закрытия страницы.": {
    en: "Some data could not be read or saved. Changes remain available until you close this page."
  },
  "Не удалось загрузить библиотеку.": { en: "Could not load the library." }
} satisfies Messages;
