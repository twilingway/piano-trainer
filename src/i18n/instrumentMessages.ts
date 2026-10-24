import type { Messages } from "./locales";

export const instrumentMessages = {
  "Не выбран": { en: "Not selected" },
  "Выберите профиль пианино, чтобы выбрать тембр.": {
    en: "Choose a piano profile to select a sound."
  },
  Автоматически: { en: "Automatically" },
  "Автоматически: {name}": { en: "Automatically: {name}" },
  "Для автоматического выбора подключите одно пианино или выберите выход вручную.": {
    en: "Connect one piano for automatic selection, or choose an output manually."
  },
  "Для прослушивания подключите MIDI-выход.": { en: "Connect a MIDI output to preview a sound." },
  "Выберите тембр для прослушивания.": { en: "Choose a sound to preview." },
  "Для этого тембра MIDI-команда пока неизвестна.": {
    en: "The MIDI command for this sound is not known yet."
  },
  "Для прослушивания выберите разные каналы мелодии и подсветки.": {
    en: "Choose different melody and key-light channels to preview a sound."
  },
  "Поставьте исполнение на паузу, чтобы прослушать тембр.": {
    en: "Pause playback to preview a sound."
  },
  "Профили и тембры пианино": { en: "Piano profiles and sounds" },
  "Профиль пианино": { en: "Piano profile" },
  "Название профиля пианино": { en: "Piano profile name" },
  "Тембр MIDI-пианино": { en: "MIDI piano sound" },
  "Не менять тембр": { en: "Keep current sound" },
  "Другие тембры": { en: "Other sounds" },
  " — нет MIDI-команды": { en: " — MIDI command unknown" },
  "Тембров в профиле: {count}": { en: "Sounds in this profile: {count}" },
  "Название на дисплее может отличаться от MIDI-номера. Неизвестные команды не отправляются.": {
    en: "Display numbers can differ from MIDI programs. Unknown commands are never sent."
  },
  "Проверка выбранного тембра": { en: "Try the selected sound" },
  "Прослушать тембр": { en: "Preview sound" },
  "Остановить прослушивание": { en: "Stop preview" },
  "Читаем профиль пианино…": { en: "Reading piano profile…" },
  "Добавить пианино из JSON": { en: "Add piano from JSON" },
  "Формат импорта пианино": { en: "Piano import format" },
  "JSON содержит название пианино и массив instruments. У каждого тембра есть name и program: MIDI-номер от 0 до 127 либо null, если команда неизвестна.":
    {
      en: "JSON contains the piano name and an instruments array. Each sound has a name and a program: a MIDI number from 0 to 127, or null if its command is unknown."
    },
  "bankMSB и bankLSB необязательны: от 0 до 127. Указывайте их только по MIDI-таблице устройства. Номер VOI на панели сам по себе не задаёт банк.":
    {
      en: "bankMSB and bankLSB are optional numbers from 0 to 127. Use the device's MIDI table. A panel VOI number does not identify a bank."
    },
  "group, panelNumber и id необязательны. midiOutputName помогает автоматически выбрать выход. Повторный импорт добавляет отдельный профиль.":
    {
      en: "group, panelNumber, and id are optional. midiOutputName helps choose the output automatically. Importing again adds a separate profile."
    },
  "Скачать пример профиля JSON": { en: "Download example JSON profile" },
  "Файл профиля больше 1 МиБ.": { en: "The profile file is larger than 1 MiB." },
  "Не удалось прочитать JSON. Проверьте формат файла.": {
    en: "Could not read JSON. Check the file format."
  },
  "В профиле нужны название пианино и список instruments.": {
    en: "The profile needs a piano name and an instruments list."
  },
  "Эта версия профиля не поддерживается. Используйте version: 1.": {
    en: "This profile version is not supported. Use version: 1."
  },
  "Название пианино должно содержать от 1 до 120 символов.": {
    en: "The piano name must be between 1 and 120 characters."
  },
  "midiOutputName должен быть непустым названием MIDI-выхода до 120 символов.": {
    en: "midiOutputName must be a nonempty MIDI output name of up to 120 characters."
  },
  "В instruments должно быть от 1 до 512 тембров.": {
    en: "instruments must contain between 1 and 512 sounds."
  },
  "Проверьте название, id и другие поля тембра в записи {number}.": {
    en: "Check the name, id, and other fields of sound entry {number}."
  },
  "В записи {number} program должен быть целым числом от 0 до 127 либо null.": {
    en: "In entry {number}, program must be an integer from 0 to 127, or null."
  },
  "В записи {number} банк должен быть числом от 0 до 127 и использоваться с числовым program.": {
    en: "In entry {number}, bank values must be integers from 0 to 127 and require a numeric program."
  },
  "В записи {number} повторяется id тембра. Сделайте id уникальными.": {
    en: "Entry {number} repeats a sound id. Give each sound a unique id."
  },
  "Можно добавить не больше 64 профилей пианино.": {
    en: "You can add up to 64 piano profiles."
  },
  "Не удалось открыть файл профиля пианино.": { en: "Could not open the piano profile file." }
} satisfies Messages;
