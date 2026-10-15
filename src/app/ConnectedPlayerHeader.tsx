import { useI18n } from "./useI18n";
import { usePlayChoice } from "./usePlayChoice";
import { useRuntimeCommand } from "./runtimeCommands";
import { GameModeSegment } from "../ui/GameModeSwitch";
import { WordTextPopover } from "../ui/WordTextPopover";
import { WordQuality } from "../ui/WordTypingBoard";
import { ConnectedPlayerTopBar, ConnectedSongProgress } from "./ConnectedPlayback";
import { lessonDisplayTitle } from "./lessonDisplayTitle";
import { COURSE_STAGE_LABELS } from "../ui/CourseCards";
import { stagePhrases } from "../course/model";
import { useRuntimeSelector } from "./PlayerRuntimeProvider";
import { ConnectedCourseLessonBar } from "./ConnectedCourse";
import { READING_TASK_LABELS } from "../ui/ReadingCourse";
import { BASS_READING_TASK_LABELS } from "../ui/BassReadingProgress";
import { INTERVAL_MODE_LABELS } from "../ui/IntervalCourse";
import { TWO_HAND_TITLE } from "../ui/TwoHandProgress";
import { HELD_BASS_TITLE } from "../ui/HeldBassProgress";
import { INDEPENDENT_RHYTHM_TITLE } from "../ui/IndependentRhythmIntro";

import { shallowEqual } from "react-redux";
export function ConnectedPlayerHeader() {
  const {
    sound,
    settingsOpen,
    song,
    playing,
    fullscreenActive,
    currentLesson,
    hasArrangement,
    simplified,
    wordPracticeSong,
    wordEnabled,
    wordPending,
    wordError,
    wordLanguage,
    wordResult,
    wordNotice,
    screenEditing,
    trainerSnapshotSource,
    trainerMode,
    trainerSpeed,
    inputMidiName,
    courseActive,
    comparing,
    readingTask,
    readingIsBass,
    twoHandActive,
    heldBassActive,
    independentRhythmActive,
    rhythmActive,
    intervalMode,
    practiceActive
  } = useRuntimeSelector(
    (runtime) => ({
      sound: runtime.sound,
      settingsOpen: runtime.settingsOpen,
      song: runtime.song,
      playing: runtime.playing,
      fullscreenActive: runtime.fullscreen.active,
      currentLesson: runtime.current.lesson,
      hasArrangement: !runtime.practiceActive && runtime.current.arrangement !== undefined,
      simplified: runtime.current.arrangement?.simplified ?? false,
      wordPracticeSong: runtime.word.practiceSong,
      wordEnabled: runtime.word.enabled,
      wordPending: runtime.word.pending,
      wordError: runtime.word.error,
      wordLanguage: runtime.word.language,
      wordResult: runtime.word.result,
      wordNotice: runtime.word.notice,
      screenEditing: runtime.screen.editing,
      trainerSnapshotSource: runtime.trainer.snapshotSource,
      trainerMode: runtime.trainer.mode,
      trainerSpeed: runtime.trainer.speed,
      inputMidiName: runtime.input.midiName,
      courseActive: runtime.course.active,
      comparing: runtime.comparing,
      readingTask: runtime.reading.task,
      readingIsBass: runtime.reading.isBass,
      twoHandActive: runtime.twoHand.active,
      heldBassActive: runtime.heldBass.active,
      independentRhythmActive: runtime.independentRhythm.active,
      rhythmActive: runtime.rhythm.active,
      intervalMode: runtime.intervals.active ? runtime.intervals.mode : null,
      practiceActive: runtime.practiceActive
    }),
    shallowEqual
  );
  const fullscreenToggle = useRuntimeCommand((runtime) => runtime.fullscreen.toggle);
  const setLibraryOpen = useRuntimeCommand((runtime) => runtime.setLibraryOpen);
  const setSettingsOpen = useRuntimeCommand((runtime) => runtime.setSettingsOpen);
  const play = useRuntimeCommand((runtime) => runtime.play);
  const startOver = useRuntimeCommand((runtime) => runtime.startOver);
  const chooseGame = useRuntimeCommand((runtime) => runtime.chooseGame);
  const onSimplified = useRuntimeCommand(
    (runtime) => (value: boolean) => runtime.current.arrangement?.onSimplified(value)
  );
  const screenToggleEditing = useRuntimeCommand((runtime) => runtime.screen.toggleEditing);
  const trainerSetMode = useRuntimeCommand((runtime) => runtime.trainer.setMode);
  const trainerSetSpeed = useRuntimeCommand((runtime) => runtime.trainer.setSpeed);
  const trainerSeekToBeat = useRuntimeCommand((runtime) => runtime.trainer.seekToBeat);
  const computerKeyboard_endEditing = useRuntimeCommand(
    (runtime) => runtime.computerKeyboard.endEditing
  );
  const { t } = useI18n();
  const playChoice = usePlayChoice();
  return (
    <>
      <div className="shell-top">
        <ConnectedPlayerTopBar
          source={trainerSnapshotSource}
          song={wordPracticeSong}
          title={
            independentRhythmActive
              ? t(INDEPENDENT_RHYTHM_TITLE)
              : heldBassActive
                ? t(HELD_BASS_TITLE)
                : twoHandActive
                  ? t(TWO_HAND_TITLE)
                  : rhythmActive
                    ? t("Ритм под метроном")
                    : intervalMode
                      ? `${t("Интервалы")} · ${t(INTERVAL_MODE_LABELS[intervalMode])}`
                      : readingTask
                        ? readingIsBass && readingTask !== "check"
                          ? t(BASS_READING_TASK_LABELS[readingTask])
                          : `${t("Читаю пять нот")} · ${t(READING_TASK_LABELS[readingTask])}`
                        : courseActive
                          ? `${t(courseActive.lesson.title, { number: courseActive.lesson.number })} · ${t(COURSE_STAGE_LABELS[courseActive.selection.stage])} · ${courseActive.phrase.title ? t(courseActive.phrase.title) : t("Фраза {number}", { number: stagePhrases(courseActive.lesson, courseActive.selection.stage).findIndex((phrase) => phrase.id === courseActive.phrase.id) + 1 })}`
                          : lessonDisplayTitle(song.title, currentLesson, t)
          }
          playing={playing}
          soundLoading={sound === "loading" || (wordEnabled && (wordPending || Boolean(wordError)))}
          mode={trainerMode}
          {...playChoice}
          speed={trainerSpeed}
          fixedPractice={practiceActive}
          difficulty={hasArrangement ? { simplified, onSimplified } : undefined}
          midi={inputMidiName}
          settingsOpen={settingsOpen}
          fullscreen={fullscreenActive}
          onFullscreen={() => void fullscreenToggle()}
          toggles={<HeaderSlot name="toggles" />}
          game={
            practiceActive ? undefined : (
              <GameModeSegment wordTyping={wordEnabled} locked={playing} onChange={chooseGame} />
            )
          }
          practice={
            wordEnabled && (
              <WordTextPopover
                settings={<HeaderSlot name="wordSettings" />}
                language={wordLanguage}
                metrics={wordResult?.metrics}
                notice={wordNotice}
              />
            )
          }
          course={
            !practiceActive && !wordEnabled && !comparing && courseActive ? (
              <ConnectedCourseLessonBar />
            ) : undefined
          }
          timing={<HeaderSlot name="timingStatus" />}
          // A phone holds the game's strip in the menu.
          menuExtra={
            <>
              {!practiceActive && <HeaderSlot name="modeSwitch" />}
              {wordEnabled && <WordQuality metrics={wordResult?.metrics} />}
            </>
          }
          editing={!practiceActive && screenEditing}
          onToggleEditing={() => {
            if (!practiceActive) screenToggleEditing();
          }}
          onLibrary={() => {
            setLibraryOpen(true);
          }}
          onRestart={startOver}
          onTogglePlay={play}
          onMode={trainerSetMode}
          onSpeed={trainerSetSpeed}
          onSettings={() => {
            computerKeyboard_endEditing();
            setSettingsOpen((open) => !open);
          }}
        />
        {!practiceActive && (
          <ConnectedSongProgress
            source={trainerSnapshotSource}
            song={wordPracticeSong}
            speed={trainerSpeed}
            onSeek={trainerSeekToBeat}
          />
        )}
        {!practiceActive && <HeaderSlot name="modeSwitch" />}
      </div>
    </>
  );
}

function HeaderSlot({
  name
}: {
  name: "toggles" | "wordSettings" | "timingStatus" | "modeSwitch";
}) {
  return useRuntimeSelector((runtime) => runtime[name]);
}
