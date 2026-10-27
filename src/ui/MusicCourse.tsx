import { MusicCourseResultDetails, MusicCourseResultSummary } from "./MusicCourseResultDetails";
import { GameDialog } from "./GameDialog";
import { useLessonWindow } from "./LessonWorkspace";
import { LessonMenuItem, LessonSlot } from "./LessonSlots";
import { musicLessonAction, musicButtonAnswer } from "../app/musicLessonAction";
import { LessonIllustration } from "./LessonIllustration";
import { useState } from "react";
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
  preflight: "Подготовьте руку и найдите рисунок нот",
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
export const MUSIC_TASK_INSTRUCTIONS: Readonly<Record<MusicTaskKind, string>> = {
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
      <div
        className="music-course-catalog first-steps-music"
        aria-label={t("Новые музыкальные курсы")}
      >
        {cards.map((card) => (
          <section className="reading-course-card music-course-card" key={card.course}>
            <LessonIllustration lesson={card.course} />
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
  const { t, formatNumber } = useI18n();
  const windows = useLessonWindow();
  const [localWindow, setLocalWindow] = useState<string | null>(null);
  const [theoryOpen, setTheoryOpen] = useState(false);
  const openWindow = windows?.open ?? localWindow;
  const setWindow = (id: string | null) => {
    if (windows) windows.onOpen(id);
    else setLocalWindow(id);
  };
  const result = ["result", "completed"].includes(view.status) ? view.result : undefined;
  const choices = view.choices ?? DEFAULT_CHOICES[view.taskKind] ?? [];
  const answerChoices = choices.filter((choice) => !choice.value.endsWith("-alternative"));
  const alternatives = choices.filter((choice) => choice.value.endsWith("-alternative"));
  const canAnswer = view.ready && !view.error && (view.canAnswer ?? view.status === "reply");
  const action = musicLessonAction(view);
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
      {view.counter ? (
        <LessonSlot name="counter">
          <span className="lesson-counter">
            {t("Задание {current} из {total}", {
              current: formatNumber(view.counter.current),
              total: formatNumber(view.counter.total)
            })}
          </span>
        </LessonSlot>
      ) : null}
      <LessonSlot name="exit">
        <button
          type="button"
          className="game-button lesson-exit"
          onClick={() => {
            onCommand("exit");
          }}
        >
          {t("Выйти")}
        </button>
      </LessonSlot>
      <LessonSlot name="feedback">
        <p className="music-course-status" role="status">
          {t(view.phaseKey ?? STATUS[view.status])}
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
        {!view.allReleased ? <p>{t("Отпустите все клавиши перед продолжением.")}</p> : null}
        {view.showHelp ? (
          <div className="music-course-help" role="status">
            <p>{t("Подсказка использована: этот проход остаётся обучением.")}</p>
            {view.helpKeys?.map((key) => (
              <p key={key}>{t(key)}</p>
            ))}
          </div>
        ) : null}
        {result ? (
          <div className="lesson-result">
            <div role="status">
              <MusicCourseResultSummary result={result} />
            </div>
            <button
              type="button"
              className="game-button"
              onClick={() => {
                setWindow("music-result");
              }}
            >
              {t("Подробнее")}
            </button>
          </div>
        ) : null}
      </LessonSlot>
      <p
        className={
          windows
            ? "music-course-instruction lesson-repeated-instruction"
            : "music-course-instruction"
        }
      >
        {t(view.instructionKey ?? MUSIC_TASK_INSTRUCTIONS[view.taskKind], view.instructionParams)}
      </p>
      {!windows && action.command && action.command !== "stop" ? (
        <button
          type="button"
          className="game-button lesson-main-action"
          disabled={action.disabled}
          onClick={() => {
            if (action.command && action.command !== "stop") onCommand(action.command);
          }}
        >
          {t(action.labelKey)}
        </button>
      ) : null}
      <LessonSlot name="answer">
        {answerChoices.length > 0 && (view.canAnswer || result) ? (
          <div
            className="reading-actions music-course-choices"
            role="group"
            aria-label={t("Варианты музыкального ответа")}
          >
            {answerChoices.map((choice) => (
              <button
                type="button"
                className="game-button"
                key={choice.value}
                disabled={!canAnswer || (!result && !musicButtonAnswer(view))}
                onClick={(event) => {
                  choose(choice.value, event);
                }}
              >
                {t(choice.labelKey, choiceParams(choice, t))}
              </button>
            ))}
          </div>
        ) : null}
        {alternatives.length > 0 ? (
          <div className="reading-actions">
            {alternatives.map((choice) => (
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
      </LessonSlot>
      <LessonSlot name="hint">
        {view.canListen && action.command !== "listen" ? (
          <button
            type="button"
            className="game-button"
            disabled={!view.ready}
            onClick={() => {
              onCommand("listen");
            }}
          >
            {t("Послушать образец ещё раз")}
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
            {t("Подсказка")}
          </button>
        ) : null}
      </LessonSlot>
      {(view.canRetry || view.error) && action.command !== "retry" ? (
        <LessonMenuItem
          kind="repeat"
          label={t(
            view.retryCreatesNewMaterial ? "Новый пример для проверки" : "Повторить текущее"
          )}
          disabled={view.canRetry === false}
          onSelect={() => {
            onCommand("retry");
          }}
        />
      ) : null}
      {!result && view.course !== "integrated" ? (
        <LessonMenuItem
          kind="newSeries"
          label={t("Новое задание")}
          onSelect={() => {
            onCommand("new");
          }}
        />
      ) : null}
      <LessonMenuItem
        kind="guide"
        label={t("Как это работает")}
        onSelect={() => {
          setTheoryOpen(true);
        }}
      />
      <LessonMenuItem
        kind="settings"
        label={t("Параметры и ввод")}
        note={windows?.interruptsAttempt ? t("остановит попытку") : undefined}
        onSelect={() => {
          setWindow("music-settings");
        }}
      />
      <GameDialog
        open={theoryOpen}
        modal={false}
        title={t("Как это работает")}
        className="lesson-theory-panel"
        onClose={() => {
          setTheoryOpen(false);
        }}
      >
        {theoryOpen ? <p>{t(theory)}</p> : null}
      </GameDialog>
      <GameDialog
        open={openWindow === "music-settings"}
        title={t("Параметры и ввод")}
        className="lesson-settings-dialog"
        onClose={() => {
          setWindow(null);
        }}
      >
        {openWindow === "music-settings" ? <MusicCourseSettings {...props} /> : null}
      </GameDialog>
      <GameDialog
        open={openWindow === "music-result"}
        title={t("Подробный результат")}
        onClose={() => {
          setWindow(null);
        }}
      >
        {openWindow === "music-result" && result ? (
          <MusicCourseResultDetails result={result} />
        ) : null}
      </GameDialog>
    </section>
  );
}
