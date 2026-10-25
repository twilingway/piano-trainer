import { MusicCourseNotes } from "./MusicCourseNotes";
import type { MessageParams } from "../i18n/locales";
import { MusicCourseSettings, musicCourseNoteLabel } from "./MusicCourseSettings";
import type { MouseEvent } from "react";
import { useI18n } from "../app/useI18n";
import type { MusicCourse } from "../musicLearning/types";
import type {
  MusicCourseCardView,
  MusicCourseChoice,
  MusicCoursePracticeProps,
  MusicCoursePreferences,
  MusicTaskKind
} from "./musicCourseTypes";
export type {
  MusicCourseView,
  MusicCoursePreferences,
  MusicCourseCommand,
  MusicCoursePracticeProps
} from "./musicCourseTypes";

export const MUSIC_COURSE_LABELS: Readonly<Record<MusicCourse, string>> = {
  "sight-reading": "Чтение с листа",
  harmony: "Гармония",
  dictation: "Диктанты",
  integrated: "Мини-уроки"
};
const GOALS: Readonly<Record<MusicCourse, string>> = {
  "sight-reading": "Прочитайте новую фразу и сыграйте её с первого раза.",
  harmony: "Узнавайте аккорды и связывайте их за инструментом.",
  dictation: "Послушайте короткую фразу и повторите её на клавишах.",
  integrated: "Соедините слух, чтение и игру в одном коротком уроке."
};
const STATUS: Readonly<Record<MusicCoursePracticeProps["view"]["status"], string>> = {
  preparation: "Подготовка задания",
  preview: "Предпросмотр фразы",
  ready: "Можно начинать",
  playing: "Играйте фразу",
  listening: "Звучит эталон",
  reply: "Ваш ответ",
  result: "Задание разобрано",
  paused: "Урок приостановлен",
  error: "Задание недоступно",
  completed: "Музыкальный урок завершён"
};
const INSTRUCTIONS: Readonly<Record<MusicTaskKind, string>> = {
  "sight-reading": "Посмотрите фразу, затем начните игру. Сохраняйте порядок нот и ритм.",
  group: "Как устроена эта группа нот? Выберите её рисунок.",
  position: "Найдите нижнюю клавишу указанной позиции руки.",
  "tone-semitone": "Сыграйте или послушайте две ноты. Определите: между ними тон или полутон.",
  "build-chord": "Нажмите все звуки аккорда вместе и удерживайте до подтверждения.",
  "name-chord": "Рассмотрите или послушайте аккорд. Выберите его название.",
  "invert-chord": "Сыграйте обращение аккорда. Обратите внимание на нижний звук.",
  function: "Определите роль аккорда в тональности и выберите функцию.",
  progression: "Продолжите последовательность аккордов по заданному плану.",
  accompaniment: "Сыграйте аккорды сопровождения вместе с мелодией.",
  "voice-leading": "Свяжите аккорды плавно: удерживайте общие звуки и перемещайте остальные.",
  dictation:
    "Прослушайте эталон целиком, затем повторите фразу. Отпустите клавиши и завершите ответ.",
  "auditory-interval": "Послушайте два звука и выберите услышанный интервал.",
  integrated: "Выполните текущее задание урока. К следующему этапу переходите после результата."
};
const THEORY: Readonly<Record<MusicCoursePreferences["harmonyLesson"], string>> = {
  "tone-semitone":
    "Полутон — расстояние до соседней клавиши, белой или чёрной. Тон состоит из двух полутонов.",
  triads:
    "Трезвучие строится из основного звука, терции и квинты. Мажорная терция шире минорной на полутон.",
  inversions:
    "В обращении меняется нижний звук, а состав аккорда сохраняется. Слушайте бас и сравнивайте расположение звуков.",
  functions:
    "Тоника даёт ощущение опоры, субдоминанта уводит от неё, доминанта тяготеет к возвращению.",
  progressions:
    "Римские цифры обозначают ступень основного звука аккорда. Пройдите последовательность, сохраняя пульс.",
  accompaniment:
    "Партия мелодии и аккорды движутся в общем темпе. Следите за моментом смены гармонии.",
  "voice-leading":
    "Общие звуки можно удерживать. Остальные голоса перемещайте к ближайшим звукам следующего аккорда."
};
const ACTIVE_THEORY: Partial<Record<MusicTaskKind, MusicCoursePreferences["harmonyLesson"]>> = {
  "tone-semitone": "tone-semitone",
  "build-chord": "triads",
  "name-chord": "triads",
  "invert-chord": "inversions",
  function: "functions",
  progression: "progressions",
  accompaniment: "accompaniment",
  "voice-leading": "voice-leading"
};
export const MUSIC_GROUP_CHOICES: readonly MusicCourseChoice[] = [
  { value: "scalar", labelKey: "Поступенное движение" },
  { value: "triadic", labelKey: "Движение по трезвучию" },
  { value: "repeated", labelKey: "Повторяющиеся звуки" },
  { value: "mixed", labelKey: "Смешанный рисунок" }
];
export const MUSIC_INTERVAL_CHOICES: readonly MusicCourseChoice[] = [
  { value: "3", labelKey: "Слышу терцию" },
  { value: "5", labelKey: "Слышу квинту" }
];
const DEFAULT_CHOICES: Partial<Record<MusicTaskKind, readonly MusicCourseChoice[]>> = {
  group: MUSIC_GROUP_CHOICES,
  "auditory-interval": MUSIC_INTERVAL_CHOICES,
  "tone-semitone": [
    { value: "semitone", labelKey: "Между нотами полутон" },
    { value: "tone", labelKey: "Между нотами тон" }
  ],
  "name-chord": [
    { value: "major", labelKey: "Мажорное трезвучие" },
    { value: "minor", labelKey: "Минорное трезвучие" }
  ],
  function: [
    { value: "tonic", labelKey: "Тоническая функция" },
    { value: "subdominant", labelKey: "Субдоминантовая функция" },
    { value: "dominant", labelKey: "Доминантовая функция" }
  ]
};

function choiceParams(
  choice: MusicCourseChoice,
  t: (key: string) => string
): MessageParams | undefined {
  const params =
    typeof choice.params?.skill === "string"
      ? { ...choice.params, skill: t(choice.params.skill) }
      : choice.params;
  return choice.pitch === undefined
    ? params
    : { ...params, note: musicCourseNoteLabel(choice.pitch, t) };
}

export function MusicCourseCatalog({
  cards,
  onOpen,
  onProgress,
  progressOpen = false
}: {
  readonly cards: readonly MusicCourseCardView[];
  readonly onOpen: (course: MusicCourse) => void;
  readonly onProgress?: () => void;
  readonly progressOpen?: boolean;
}) {
  const { t, formatNumber } = useI18n();
  return (
    <>
      <div className="music-course-catalog" aria-label={t("Новые музыкальные курсы")}>
        {cards.map((card) => (
          <section className="reading-course-card music-course-card" key={card.course}>
            <h3>{t(MUSIC_COURSE_LABELS[card.course])}</h3>
            <p>{t(GOALS[card.course])}</p>
            <p className="reading-muted">
              {t("Завершено музыкальных занятий: {number}", {
                number: formatNumber(card.completedRuns)
              })}
            </p>
            <button
              type="button"
              className="game-button"
              onClick={() => {
                onOpen(card.course);
              }}
            >
              {t(card.resumable ? "Продолжить музыкальный курс" : "Начать музыкальный курс")}
            </button>
          </section>
        ))}
      </div>
      {onProgress ? (
        <button
          type="button"
          className="game-button music-progress-entry"
          aria-expanded={progressOpen}
          aria-controls="music-course-progress"
          onClick={onProgress}
        >
          {t("Мой музыкальный прогресс")}
        </button>
      ) : null}
    </>
  );
}

export function MusicCoursePractice(props: MusicCoursePracticeProps) {
  const { view, onCommand, onChoose } = props;
  const result = ["result", "completed"].includes(view.status) ? view.result : undefined;
  const { t, formatNumber } = useI18n();
  const choices = view.choices ?? DEFAULT_CHOICES[view.taskKind] ?? [];
  const canAnswer = view.ready && !view.error && (view.canAnswer ?? view.status === "reply");
  const showStart = ["preparation", "ready", "paused"].includes(view.status);
  const showListen =
    view.canListen ||
    view.status === "listening" ||
    ["dictation", "auditory-interval"].includes(view.taskKind);
  const showFinish = view.canFinish || ["reply", "playing"].includes(view.status);
  const theory =
    view.course === "harmony"
      ? THEORY[ACTIVE_THEORY[view.taskKind] ?? "triads"]
      : GOALS[view.course];
  const choose = (value: string, event: MouseEvent<HTMLButtonElement>) => {
    onChoose(value, event.detail === 0 ? "keyboard" : "pointer");
  };
  return (
    <section
      className="reading-practice music-course-practice"
      aria-label={t(MUSIC_COURSE_LABELS[view.course])}
    >
      <div className="music-course-heading">
        <h3>{t(MUSIC_COURSE_LABELS[view.course])}</h3>
        <button
          type="button"
          className="game-button"
          onClick={() => {
            onCommand("exit");
          }}
        >
          {t("Выйти из музыкального урока")}
        </button>
      </div>
      <p className="music-course-status" role="status">
        {t(view.phaseKey ?? STATUS[view.status])}
        {view.counter
          ? t(" · Задание {current} из {total}", {
              current: formatNumber(view.counter.current),
              total: formatNumber(view.counter.total)
            })
          : null}
      </p>
      <p className="music-course-instruction">
        {t(view.instructionKey ?? INSTRUCTIONS[view.taskKind], view.instructionParams)}
      </p>
      {view.previewSeconds !== undefined ? (
        <p>{t("До закрытия нот: {seconds} с", { seconds: formatNumber(view.previewSeconds) })}</p>
      ) : null}
      {view.startPitch !== undefined ? (
        <p className="music-course-anchor">
          {t("Начните с {note}.", { note: musicCourseNoteLabel(view.startPitch, t) })}
        </p>
      ) : null}
      {view.positionLowPitch !== undefined ? (
        <p>
          {t("Позиция руки от ноты {note}", {
            note: musicCourseNoteLabel(view.positionLowPitch, t)
          })}
        </p>
      ) : null}
      {view.error ? <p role="alert">{t(view.error.key, view.error.params)}</p> : null}
      {!view.ready && !view.error ? (
        <p className="reading-muted">{t("Дождитесь готовности нот и звука.")}</p>
      ) : null}
      {!view.allReleased ? (
        <p className="reading-muted">{t("Отпустите все клавиши перед продолжением.")}</p>
      ) : null}
      <div className="reading-actions music-course-actions">
        {showStart ? (
          <button
            type="button"
            className="game-button"
            disabled={!view.canStart || !view.ready || !view.allReleased}
            onClick={() => {
              onCommand("start");
            }}
          >
            {t(
              view.status === "paused"
                ? "Продолжить музыкальное задание"
                : "Начать музыкальное задание"
            )}
          </button>
        ) : null}
        {showListen ? (
          <button
            type="button"
            className="game-button"
            disabled={!view.canListen || !view.ready}
            onClick={() => {
              onCommand("listen");
            }}
          >
            {t("Прослушать музыкальный эталон")}
          </button>
        ) : null}
        {showFinish ? (
          <button
            type="button"
            className="game-button"
            disabled={!view.canFinish || !view.ready || !view.allReleased}
            onClick={() => {
              onCommand("finish");
            }}
          >
            {t("Завершить музыкальный ответ")}
          </button>
        ) : null}
        {view.canNext ? (
          <button
            type="button"
            className="game-button"
            disabled={!view.allReleased}
            onClick={() => {
              onCommand("next");
            }}
          >
            {t("К следующему музыкальному заданию")}
          </button>
        ) : null}
        {view.canRetry || view.error ? (
          <button
            type="button"
            className="game-button"
            disabled={view.canRetry === false}
            onClick={() => {
              onCommand("retry");
            }}
          >
            {t("Повторить музыкальное задание")}
          </button>
        ) : null}
        {view.canHelp ? (
          <button
            type="button"
            className="game-button"
            disabled={view.showHelp}
            onClick={() => {
              onCommand("hint");
            }}
          >
            {t("Подсказка к музыкальному заданию")}
          </button>
        ) : null}
      </div>
      {choices.length > 0 &&
      (view.canAnswer ?? ["ready", "playing", "reply"].includes(view.status)) ? (
        <div
          className="reading-actions music-course-choices"
          role="group"
          aria-label={t("Варианты музыкального ответа")}
        >
          {choices.map((choice) => (
            <button
              type="button"
              className="game-button"
              key={choice.value}
              disabled={!canAnswer}
              onClick={(event) => {
                choose(choice.value, event);
              }}
            >
              {t(choice.labelKey, choiceParams(choice, t))}
            </button>
          ))}
        </div>
      ) : null}
      {view.showHelp ? (
        <details open className="music-course-help">
          <summary>{t("Разбор подсказки")}</summary>
          <p>{t("Подсказка использована: этот проход остаётся обучением.")}</p>
          {view.helpKeys?.map((key) => (
            <p key={key}>{t(key)}</p>
          ))}
        </details>
      ) : null}
      {result ? (
        <div className="music-course-result">
          <p>{t(result.summaryKey ?? "Результат музыкального задания")}</p>
          <p className="reading-muted">
            {t(
              result.helped
                ? "Проход с музыкальной подсказкой"
                : "Самостоятельный музыкальный ответ"
            )}
            {t(result.newMaterial ? " · Новый материал" : " · Повтор знакомого материала")}
          </p>
          <details>
            <summary>{t("Подробный разбор музыкального ответа")}</summary>
            <dl>
              {result.metrics.map((metric) => (
                <div key={metric.labelKey}>
                  <dt>{t(metric.labelKey)}</dt>
                  <dd>
                    {metric.valueKey
                      ? t(metric.valueKey)
                      : metric.value === null
                        ? t("Музыкальный показатель не измерялся")
                        : typeof metric.value === "number"
                          ? formatNumber(metric.value, { maximumFractionDigits: 2 })
                          : metric.value}
                  </dd>
                </div>
              ))}
            </dl>
            {result.notes ? <MusicCourseNotes {...result.notes} /> : null}
            {result.detailKeys?.map((key) => (
              <p key={key}>{t(key)}</p>
            ))}
          </details>
        </div>
      ) : null}
      {view.canHelp || result ? (
        <details
          className="music-course-theory"
          onToggle={(event) => {
            if (event.currentTarget.open) onCommand("theory");
          }}
        >
          <summary>{t("Почему это устроено так")}</summary>
          <p>{t(theory)}</p>
        </details>
      ) : null}
      <MusicCourseSettings {...props} />
    </section>
  );
}
