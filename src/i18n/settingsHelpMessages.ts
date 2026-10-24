import type { Messages } from "./locales";

export const settingsHelpMessages = {
  "Канал MIDI недоступен: мелодия звучит только на этом устройстве. Он применяется при выводе мелодии на MIDI-пианино.":
    {
      en: "The MIDI channel is unavailable while the melody plays only on this device. It applies when sending the melody to a MIDI piano."
    },
  Помощь: {
    en: "Help"
  },
  "Путеводитель по настройкам": {
    en: "Settings guide"
  },
  "Выберите раздел: переход не меняет песню и ваши настройки.": {
    en: "Choose a section. Navigation preserves your song and settings."
  },
  "Частые вопросы": {
    en: "Frequently asked questions"
  },
  "Падающие ноты и эффекты": {
    en: "Falling notes and effects"
  },
  "Руки и сцена": {
    en: "Hands and stage"
  },
  Камера: {
    en: "Camera"
  },
  "Размер и прокрутка": {
    en: "Size and scrolling"
  },
  "Цвета нотной записи": {
    en: "Notation colors"
  },
  "Подсказки к нотам": {
    en: "Note hints"
  },
  "Вход и диапазон пианино": {
    en: "Input and piano range"
  },
  "Звук и выход MIDI": {
    en: "Sound and MIDI output"
  },
  "Подсветка пианино": {
    en: "Piano key lights"
  },
  "Подключение и поправки": {
    en: "Connection and offsets"
  },
  Калибровка: {
    en: "Calibration"
  },
  "Учебный участок": {
    en: "Practice section"
  },
  "Обработка MIDI": {
    en: "MIDI arrangement"
  },
  "Тональность и диапазон": {
    en: "Key and range"
  },
  Аппликатура: {
    en: "Fingering"
  },
  "Раскладка и назначения": {
    en: "Layout and assignments"
  },
  "Текст и партия": {
    en: "Text and part"
  },
  Интерфейс: {
    en: "Interface"
  },
  Диагностика: {
    en: "Diagnostics"
  },
  "Профиль и тембр пианино": {
    en: "Piano profile and tone"
  },
  "Режим ожидания или игра в темпе, руки, скорость, метроном, правила оценки и повтор участка.": {
    en: "Play mode, hands, speed, metronome, scoring rules and section looping."
  },
  "Тональность, октава и обработка MIDI относятся к открытой песне.": {
    en: "Key, octave and MIDI arrangement apply to the open song."
  },
  "Видимые части экрана, нотная запись, клавиши, эффекты, руки, камера и расположение.": {
    en: "Visible screen parts, notation, keys, effects, hands, camera and layout."
  },
  "Раскладка компьютера и назначения клавиш. В режиме печати — язык текста, партия и слова.": {
    en: "Computer layout and key assignments. In typing mode: text language, part and words."
  },
  "MIDI-вход, диапазон пианино, выход, звук мелодии, подсветка, профиль и тембр.": {
    en: "MIDI input, piano range, output, melody sound, key lights, profile and tone."
  },
  "Подключение, поправки ввода, звука и изображения, калибровка и диагностика ввода.": {
    en: "Connection, input, audio and visual offsets, calibration and input diagnostics."
  },
  "Язык интерфейса, сведения о сборке, авторе и звуке, диагностика FPS.": {
    en: "Interface language, build, author and sound credits, and FPS diagnostics."
  },
  "Почему USB MIDI не передаёт звук пианино?": {
    en: "Why does USB MIDI not transmit the piano sound?"
  },
  "MIDI передаёт команды нот, каналов и выбора тембра, а не готовый звук. Bank Select и Program Change выбирают существующий тембр на пианино, если устройство поддерживает эти команды. Профиль описывает эти команды; он не загружает сэмплы. Готовый звук передаётся отдельным аудиоканалом.":
    {
      en: "MIDI sends note, channel and tone-selection commands, not recorded audio. Bank Select and Program Change select a tone already on the piano if it supports these commands. A profile describes the commands; it does not load samples. Actual audio is transmitted through a separate audio channel."
    },
  "Где звучит мелодия?": {
    en: "Where does the melody play?"
  },
  "В «Пианино / Звук и выход MIDI» выберите звук на этом устройстве, на MIDI-пианино или на обоих. Метроном, голосовые подсказки и ручные нажатия звучат в браузере. Тембр MIDI-пианино выбирается отдельно от звука браузера.":
    {
      en: "In Piano / Sound and MIDI output, choose this device, the MIDI piano or both. The metronome, voice hints and manual key presses sound in the browser. The MIDI piano tone is selected separately from the browser sound."
    },
  "Поможет ли калибровка от задержки Bluetooth?": {
    en: "Will calibration remove Bluetooth latency?"
  },
  "Bluetooth-аудио передаёт звук и может добавлять заметную задержку. Bluetooth MIDI передаёт команды — это другое подключение. Калибровка учитывает постоянное смещение при оценке, но не устраняет физическую задержку живого звука. Для игры с малой задержкой используйте звук самого пианино или проводной аудиовыход.":
    {
      en: "Bluetooth audio transmits sound and can add noticeable latency. Bluetooth MIDI transmits commands and is a different connection. Calibration accounts for a consistent timing offset in scoring, but cannot remove the physical delay of live audio. For low-latency play, use the piano sound or wired audio."
    },
  "Почему ноты движутся иначе при смене проекции?": {
    en: "Why do notes move differently after changing projection?"
  },
  "Прямая и перспективная проекции показывают разный участок дороги и запас времени до клавиш. Это меняет видимое движение и размеры нот. Темп песни задаётся скоростью в «Игре»; смена проекции не меняет музыкальное время и оценку.":
    {
      en: "Direct and perspective views show different road spans and look-ahead times. This changes the apparent motion and note size. Song tempo is set by Speed in Play; changing projection does not change song time or scoring."
    },
  "Где изменить белые ноты и зелёное выделение?": {
    en: "Where can I change white notes and green highlighting?"
  },
  "В «Вид / Нотная запись / Цвета нотной записи» отдельно выбираются обычные ноты и текущая сыгранная нота. По умолчанию они белые и зелёные. Цвета сохраняются после перезагрузки; разбор исполнения использует свои отметки.":
    {
      en: "In View / Notation / Notation colors, choose separate colors for normal notes and the current played note. They are white and green by default. Colors survive a reload; take review retains its own marks."
    },
  "Когда нужна калибровка?": {
    en: "When should I calibrate?"
  },
  "Откройте «Синхронизацию», выберите подключение и выполните калибровку C4 под метроном. Повторите замер после смены подключения или аудиовыхода. Поправки действуют со следующего исполнения; название аудиовыхода — подпись профиля, оно не переключает звук браузера.":
    {
      en: "Open Synchronization, choose the connection and calibrate C4 to the metronome. Repeat after changing the connection or audio output. Offsets apply to the next take; the audio-output name labels the profile and does not switch browser audio."
    },
  "Где включить FPS?": {
    en: "Where can I enable FPS?"
  },
  "Откройте «О программе / Диагностика» и включите «Показывать FPS». Это счётчик кадров изображения; он не показывает точность MIDI или исполнения.":
    {
      en: "Open About / Diagnostics and enable Show FPS. This counts rendered frames; it does not measure MIDI or playing accuracy."
    }
} satisfies Messages;
