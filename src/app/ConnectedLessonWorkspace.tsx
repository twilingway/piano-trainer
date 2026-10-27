import { musicButtonAnswer } from "./musicLessonAction";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { shallowEqual } from "react-redux";
import { useI18n } from "./useI18n";
import { useRuntimeSelector } from "./PlayerRuntimeProvider";
import { useRuntimeCommand } from "./runtimeCommands";
import { LessonWorkspace } from "../ui/LessonWorkspace";
import { ConnectedMusicPractice } from "./ConnectedMusicCourse";
import { ConnectedReadingPractice } from "./ConnectedReading";
import { ConnectedBassReadingPractice } from "./ConnectedBassReading";
import { ConnectedTwoHandPractice } from "./ConnectedTwoHand";
import { ConnectedHeldBassPractice } from "./ConnectedHeldBass";
import { ConnectedIndependentRhythmPractice } from "./ConnectedIndependentRhythm";
import { ConnectedIntervalPractice } from "./ConnectedIntervals";
import { ConnectedRhythmPractice } from "./ConnectedRhythm";
import { MUSIC_COURSE_LABELS, MUSIC_TASK_INSTRUCTIONS } from "../ui/MusicCourse";

const INPUT_LABELS = {
  midi: "MIDI-инструмент",
  keyboard: "Клавиатура компьютера",
  pointer: "Клавиши на экране"
} as const;

export function ConnectedLessonWorkspace({ score }: { readonly score: ReactNode }) {
  const { t } = useI18n();
  const state = useRuntimeSelector(
    (runtime) => ({
      music: runtime.music.active ? runtime.music.view : null,
      source: runtime.music.source,
      rhythm: runtime.rhythm.active,
      rhythmSource: runtime.rhythm.source,
      independent: runtime.independentRhythm.active,
      independentSource: runtime.independentRhythm.source,
      held: runtime.heldBass.active,
      twoHand: runtime.twoHand.active,
      intervals: runtime.intervals.active,
      ear: runtime.intervals.active && runtime.intervals.mode === "hear-and-choose",
      bass: runtime.reading.isBass,
      action: runtime.lessonAction,
      open: runtime.lessonWindow,
      playing: runtime.playing
    }),
    shallowEqual
  );
  const play = useRuntimeCommand((runtime) => runtime.play);
  const onOpen = useRuntimeCommand((runtime) => runtime.setLessonWindow);
  useEffect(
    () => () => {
      onOpen(null);
    },
    [onOpen]
  );
  const title = state.music
    ? MUSIC_COURSE_LABELS[state.music.course]
    : state.independent
      ? "Играю два ритма"
      : state.held
        ? "Держу бас, играю мелодию"
        : state.twoHand
          ? "Две руки: играю вместе"
          : state.rhythm
            ? "Ритм"
            : state.intervals
              ? "Интервалы"
              : state.bass
                ? "Левая рука: пять нот"
                : "Правая рука: пять нот";
  const instruction = state.music
    ? "Смотрите на задание и следуйте шагам под нотами."
    : state.independent
      ? "Сначала поймайте пульс, затем сыграйте две партии."
      : state.held
        ? "Держите левую ноту, а правой играйте мелодию."
        : state.twoHand
          ? "Найдите обе ноты и нажмите их вместе."
          : state.rhythm
            ? "Отбивайте начала нот. На паузах отдыхайте."
            : state.ear
              ? "Послушайте пару и выберите, как изменилась нота."
              : state.intervals
                ? "Сыграйте две ноты по порядку."
                : "Посмотрите на ноту и нажмите её клавишу.";
  const buttonAnswer = state.ear || !!(state.music && musicButtonAnswer(state.music));
  const source = state.music
    ? state.source
    : state.independent
      ? state.independentSource
      : state.rhythm
        ? state.rhythmSource
        : null;
  const input = buttonAnswer
    ? t("Ответ выбирается кнопкой: мышь, Enter или пробел.")
    : source
      ? t("Играйте так: {source}", { source: t(INPUT_LABELS[source]) })
      : t("Играйте на MIDI, клавиатуре компьютера или клавишах на экране.");
  return (
    <LessonWorkspace
      title={t(title)}
      instruction={
        state.music
          ? t(
              state.music.instructionKey ?? MUSIC_TASK_INSTRUCTIONS[state.music.taskKind],
              state.music.instructionParams
            )
          : t(instruction)
      }
      input={input}
      score={score}
      windows={{ open: state.open, onOpen, interruptsAttempt: state.playing }}
      action={
        state.action.command !== null ? (
          <button
            type="button"
            className="game-button lesson-main-action"
            disabled={state.action.disabled}
            onClick={play}
          >
            {t(state.action.labelKey)}
          </button>
        ) : (
          <p className="lesson-main-instruction">{t(state.action.labelKey)}</p>
        )
      }
    >
      {state.action.reasonKey && <p role="status">{t(state.action.reasonKey)}</p>}
      <ConnectedMusicPractice />
      <ConnectedReadingPractice mode="practice" />
      <ConnectedBassReadingPractice mode="practice" />
      <ConnectedTwoHandPractice mode="practice" />
      <ConnectedHeldBassPractice mode="practice" />
      <ConnectedIndependentRhythmPractice mode="practice" />
      <ConnectedIntervalPractice />
      <ConnectedRhythmPractice />
    </LessonWorkspace>
  );
}
