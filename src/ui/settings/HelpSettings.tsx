import { useI18n } from "../../app/useI18n";
import { SETTINGS_TARGETS, type SettingTarget } from "./settingsTargets";
import { SettingsGroup } from "./SettingsGroup";

const GUIDE = [
  {
    id: "play",
    target: "play-mode",
    title: "Игра",
    description:
      "Режим ожидания или игра в темпе, руки, скорость, метроном, правила оценки и повтор участка."
  },
  {
    id: "song",
    target: "song-key",
    title: "Песня",
    description: "Тональность, октава и обработка MIDI относятся к открытой песне."
  },
  {
    id: "view",
    target: "key-style",
    title: "Вид",
    description:
      "Видимые части экрана, нотная запись, клавиши, эффекты, руки, камера и расположение."
  },
  {
    id: "computer",
    target: "computer-layout",
    title: "Ввод с ПК",
    description:
      "Раскладка компьютера и назначения клавиш. В режиме печати — язык текста, партия и слова."
  },
  {
    id: "midi",
    target: "piano-range",
    title: "Пианино",
    description: "MIDI-вход, диапазон пианино, выход, звук мелодии, подсветка, профиль и тембр."
  },
  {
    id: "timing",
    target: "audio-offset",
    title: "Синхронизация",
    description: "Подключение, поправки ввода, звука и изображения, калибровка и диагностика ввода."
  },
  {
    id: "about",
    target: "interface-language",
    title: "О программе",
    description: "Язык интерфейса, сведения о сборке, авторе и звуке, диагностика FPS."
  }
] as const;
const FAQ = [
  {
    targets: ["stylized-projection"],
    question: "Как настроить сферический горизонт художественной проекции?",
    answer:
      "В «Вид / Падающие ноты» выберите художественную систему проекции для 3D-клавиш. Радиус меняет изгиб горизонта и фона, а не камеру. Настройте размах, высоту и выпрямление у клавиш. Диагностика показывает источники и контакты всех 88 дорожек; при неподходящем ракурсе сохраняется прежняя проекция."
  },
  {
    targets: [
      "free-source-height",
      "free-source-distance",
      "free-source-width",
      "free-source-shape"
    ],
    question: "Как настроить горизонт в свободной камере?",
    answer:
      "Горизонт — линия или дуга точек появления нот, их источников. В «Вид / Падающие ноты» настройте его высоту, дальность, ширину и форму в метрах мира. Прямая и перспективная проекции сохраняют свои настройки отдельно. Высота — нижняя точка над белыми клавишами, дальность — от задней линии клавиш. У выпуклой дуги середина выше, у вогнутой — края. Вращение камеры меняет ракурс, а не ширину. Каждая клавиша диапазона, включая чёрные, имеет постоянный источник: повторные ноты идут из него же."
  },
  {
    targets: ["falling-note-style", "road-horizon", "road-width", "notes-projection"],
    question: "Где выбрать оформление нот и настроить горизонт?",
    answer:
      "В «Вид / Падающие ноты» для 3D выбираются объёмные ноты с заливкой, оформление как в аркаде или прозрачные ноты. Горизонт и ширина у горизонта настраиваются во всех видах при перспективной проекции. Горизонт 0% начинает дорогу от верхней границы её области. Выбор сохраняется и не меняет темп песни."
  },
  {
    targets: ["play-countdown"],
    question: "Как успеть поставить руки перед началом?",
    answer:
      "В «Игра / Режим и темп» задайте отсчёт перед игрой от 0 до 10 секунд. По умолчанию — 3 секунды только перед первым запуском песни или после «Сначала». После паузы игра продолжается сразу. Кнопка игры или Ctrl+Пробел отменяет подготовку."
  },
  {
    targets: ["note-burning", "note-flash", "note-particles"],
    question: "Как оставить эффекты без падающих нот?",
    answer:
      "В «Вид / Анимация и эффекты» отдельно включаются горение, вспышка при нажатии и летящие нотки. Они работают над клавишами в классике, аркаде и 3D, даже если падающие ноты скрыты. Скрытые клавиши не мешают эффектам на линии попадания."
  },
  {
    targets: ["midi-output", "instrument-profile", "instrument-voice"],
    question: "Почему USB MIDI не передаёт звук пианино?",
    answer:
      "MIDI передаёт команды нот, каналов и выбора тембра, а не готовый звук. Bank Select и Program Change выбирают существующий тембр на пианино, если устройство поддерживает эти команды. Профиль описывает эти команды; он не загружает сэмплы. Готовый звук передаётся отдельным аудиоканалом."
  },
  {
    targets: ["melody-output", "melody-channel"],
    question: "Где звучит мелодия?",
    answer:
      "В «Пианино / Звук и выход MIDI» выберите звук на этом устройстве, на MIDI-пианино или на обоих. Метроном, голосовые подсказки и ручные нажатия звучат в браузере. Тембр MIDI-пианино выбирается отдельно от звука браузера."
  },
  {
    targets: ["connection-type", "audio-offset"],
    question: "Поможет ли калибровка от задержки Bluetooth?",
    answer:
      "Bluetooth-аудио передаёт звук и может добавлять заметную задержку. Bluetooth MIDI передаёт команды — это другое подключение. Калибровка учитывает постоянное смещение при оценке, но не устраняет физическую задержку живого звука. Для игры с малой задержкой используйте звук самого пианино или проводной аудиовыход."
  },
  {
    targets: ["notes-projection", "play-mode"],
    question: "Почему ноты движутся иначе при смене проекции?",
    answer:
      "Прямая и перспективная проекции показывают разный участок дороги и запас времени до клавиш. Это меняет видимое движение и размеры нот. Темп песни задаётся скоростью в «Игре»; смена проекции не меняет музыкальное время и оценку."
  },
  {
    targets: ["note-color", "played-note-color"],
    question: "Где изменить белые ноты и зелёное выделение?",
    answer:
      "В «Вид / Нотная запись / Цвета нотной записи» отдельно выбираются обычные ноты и текущая сыгранная нота. По умолчанию они белые и зелёные. Цвета сохраняются после перезагрузки; разбор исполнения использует свои отметки."
  },
  {
    targets: ["calibration", "audio-offset"],
    question: "Когда нужна калибровка?",
    answer:
      "Откройте «Синхронизацию», выберите подключение и выполните калибровку C4 под метроном. Повторите замер после смены подключения или аудиовыхода. Поправки действуют со следующего исполнения; название аудиовыхода — подпись профиля, оно не переключает звук браузера."
  },
  {
    targets: ["fps"],
    question: "Где включить FPS?",
    answer:
      "Откройте «О программе / Диагностика» и включите «Показывать FPS». Это счётчик кадров изображения; он не показывает точность MIDI или исполнения."
  }
] as const;

export function HelpSettings({
  wordTyping,
  freeCamera = false,
  onNavigate
}: {
  readonly wordTyping: boolean;
  readonly freeCamera?: boolean;
  readonly onNavigate: (target: SettingTarget) => void;
}) {
  const { t } = useI18n();
  const resolveTarget = (target: SettingTarget): SettingTarget =>
    wordTyping && target === "notes-projection" ? "shared-notes-projection" : target;
  return (
    <div className="settings-help">
      <SettingsGroup title={t("Путеводитель по настройкам")}>
        <p className="setting-hint">
          {t("Выберите раздел: переход не меняет песню и ваши настройки.")}
        </p>
        <ul className="settings-help__guide">
          {GUIDE.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="game-button"
                data-help-target={
                  item.id === "computer" && wordTyping ? "word-language" : item.target
                }
                onClick={() => {
                  onNavigate(item.id === "computer" && wordTyping ? "word-language" : item.target);
                }}
              >
                {t(item.id === "computer" && wordTyping ? "Печатать мелодию" : item.title)}
              </button>
              <p>{t(item.description)}</p>
            </li>
          ))}
        </ul>
      </SettingsGroup>
      <SettingsGroup title={t("Частые вопросы")}>
        <div className="settings-help__faq">
          {FAQ.filter(
            (item) =>
              (!wordTyping ||
                !["note-burning", "falling-note-style", "free-source-height"].includes(
                  item.targets[0]
                )) &&
              (item.targets[0] !== "free-source-height" || freeCamera) &&
              (item.targets[0] !== "falling-note-style" || !freeCamera)
          ).map((item) => (
            <details key={item.question}>
              <summary>{t(item.question)}</summary>
              <p>{t(item.answer)}</p>
              {item.targets[0] === "falling-note-style" && (
                <p>
                  {t(
                    "Отрицательные значения задают ширину дальнего края относительно экрана основного вида; свободная камера меняет его ракурс."
                  )}
                </p>
              )}
              <div className="setting-control settings-help__targets">
                {item.targets.map((target) => (
                  <button
                    type="button"
                    className="game-button"
                    key={target}
                    data-help-target={resolveTarget(target)}
                    onClick={() => {
                      onNavigate(resolveTarget(target));
                    }}
                  >
                    {t(SETTINGS_TARGETS[target].label)}
                  </button>
                ))}
              </div>
            </details>
          ))}
        </div>
      </SettingsGroup>
    </div>
  );
}
