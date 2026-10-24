/** Stable local destinations for help links; values never depend on interface language. */
export const SETTINGS_TARGETS = {
  "play-mode": {
    tab: "play",
    label: "Режим"
  },
  "song-key": {
    tab: "song",
    label: "Тональность"
  },
  "key-style": {
    tab: "view",
    label: "Вид клавиш"
  },
  "shared-notes-projection": { tab: "view", label: "Проекция нот" },
  "notes-projection": {
    tab: "view",
    label: "Проекция нот"
  },
  "note-color": {
    tab: "view",
    label: "Цвет нот"
  },
  "played-note-color": {
    tab: "view",
    label: "Цвет сыгранной ноты"
  },
  "computer-layout": {
    tab: "computer",
    label: "Раскладка компьютера"
  },
  "word-language": {
    tab: "computer",
    label: "Язык текста"
  },
  "midi-input": {
    tab: "midi",
    label: "Пианино"
  },
  "piano-range": {
    tab: "midi",
    label: "Моя клавиатура"
  },
  "midi-output": {
    tab: "midi",
    label: "Выход MIDI"
  },
  "melody-output": {
    tab: "midi",
    label: "Звук мелодии"
  },
  "melody-channel": {
    tab: "midi",
    label: "Канал мелодии"
  },
  "instrument-profile": {
    tab: "midi",
    label: "Профиль пианино"
  },
  "instrument-voice": {
    tab: "midi",
    label: "Тембр MIDI-пианино"
  },
  "connection-type": {
    tab: "timing",
    label: "Подключение"
  },
  "audio-offset": {
    tab: "timing",
    label: "Задержка звука"
  },
  calibration: {
    tab: "timing",
    label: "Калибровать C4"
  },
  "interface-language": {
    tab: "about",
    label: "Язык интерфейса"
  },
  fps: {
    tab: "about",
    label: "Показывать FPS"
  }
} as const;
export type SettingTarget = keyof typeof SETTINGS_TARGETS;
