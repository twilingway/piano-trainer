import { useRuntimeCommand } from "./runtimeCommands";
import {
  ConnectedGameBoard,
  ConnectedWordBoard,
  ConnectedWordTicker,
  ConnectedWorkspace
} from "./ConnectedPlayback";
import { useRuntimeSelector } from "./PlayerRuntimeProvider";
import { ConnectedPianoTabs } from "./ConnectedCourse";
import { ConnectedReadingPractice } from "./ConnectedReading";
import { ConnectedBassReadingPractice } from "./ConnectedBassReading";
import { ConnectedTwoHandPractice } from "./ConnectedTwoHand";
import { ConnectedHeldBassPractice } from "./ConnectedHeldBass";
import { ConnectedIndependentRhythmPractice } from "./ConnectedIndependentRhythm";
import { ConnectedRhythmPractice } from "./ConnectedRhythm";
import { ConnectedIntervalPractice } from "./ConnectedIntervals";

import { shallowEqual } from "react-redux";
export function ConnectedPracticeWorkspace() {
  const {
    displayPrefs,
    listening,
    comparing,
    playing,
    wordEnabled,
    wordResult,
    wordPending,
    wordError,
    wordNotice,
    screenLayout,
    screenMoved,
    screenEditing,
    scoreStaffXml,
    scoreFixedLines,
    takesReviewMarks,
    takesTranscription,
    takesTakeStaff,
    takesSplitDirection,
    trainerSnapshotSource,
    trainerMode,
    trainerTrainerRef,
    trainerHostRef,
    snapshotWaiting,
    viewMirrorHostRef,
    courseTabs,
    courseTopView,
    practiceActive,
    reading,
    rhythm
  } = useRuntimeSelector(
    (runtime) => ({
      displayPrefs: runtime.displayPrefs,
      listening: runtime.listening,
      comparing: runtime.comparing,
      playing: runtime.playing,
      wordEnabled: runtime.word.enabled,
      wordResult: runtime.word.result,
      wordPending: runtime.word.pending,
      wordError: runtime.word.error,
      wordNotice: runtime.word.notice,
      screenLayout: runtime.screen.layout,
      screenMoved: runtime.screen.moved,
      screenEditing: runtime.screen.editing,
      scoreStaffXml: runtime.score.staffXml,
      scoreFixedLines: runtime.score.fixedLines,
      takesReviewMarks: runtime.takes.reviewMarks,
      takesTranscription: runtime.takes.transcription,
      takesTakeStaff: runtime.takes.takeStaff,
      takesSplitDirection: runtime.takes.splitDirection,
      trainerSnapshotSource: runtime.trainer.snapshotSource,
      trainerMode: runtime.trainer.mode,
      trainerTrainerRef: runtime.trainer.trainerRef,
      trainerHostRef: runtime.trainer.hostRef,
      snapshotWaiting: runtime.snapshot.waiting,
      viewMirrorHostRef: runtime.view.mirrorHostRef,
      rhythm: runtime.rhythm,
      reading: runtime.independentRhythm.active
        ? runtime.independentRhythm
        : runtime.heldBass.active
          ? runtime.heldBass
          : runtime.twoHand.active
            ? runtime.twoHand
            : runtime.intervals.active
              ? runtime.intervals
              : runtime.reading,
      courseTabs:
        !runtime.practiceActive &&
        runtime.course.active !== null &&
        (runtime.course.saved.view === "tabs" || runtime.course.saved.view === "both") &&
        !runtime.comparing,
      courseTopView: runtime.course.saved.topView,
      practiceActive: runtime.practiceActive
    }),
    shallowEqual
  );
  const updateStaffPrefs = useRuntimeCommand((runtime) => runtime.updateStaffPrefs);
  const screenUpdateLayout = useRuntimeCommand((runtime) => runtime.screen.updateLayout);
  const screenResetLayout = useRuntimeCommand((runtime) => runtime.screen.resetLayout);
  const trainerLiveBeat = useRuntimeCommand((runtime) => runtime.trainer.liveBeat);
  const trainerSeekToBeat = useRuntimeCommand((runtime) => runtime.trainer.seekToBeat);
  return (
    <>
      <ConnectedReadingPractice />
      <ConnectedBassReadingPractice />
      <ConnectedTwoHandPractice />
      <ConnectedHeldBassPractice />
      <ConnectedIndependentRhythmPractice />
      <ConnectedIntervalPractice />
      <ConnectedRhythmPractice />
      <ConnectedWorkspace
        scoreBoard={courseTabs ? <ConnectedPianoTabs /> : undefined}
        scoreFirst={courseTopView}
        source={trainerSnapshotSource}
        wordBoard={
          wordEnabled && !comparing ? (
            <ConnectedWordBoard
              source={trainerSnapshotSource}
              result={wordResult}
              listening={listening}
              pending={wordPending}
              error={wordError}
              notice={wordNotice}
            />
          ) : undefined
        }
        wordTicker={
          wordEnabled && !comparing ? (
            <ConnectedWordTicker
              source={trainerSnapshotSource}
              result={wordResult}
              listening={listening}
              pending={wordPending}
              error={wordError}
            />
          ) : undefined
        }
        gameBoard={
          !reading.active &&
          !rhythm.active && (
            <ConnectedGameBoard
              source={trainerSnapshotSource}
              mode={trainerMode}
              playing={playing}
              onOverdrive={() => {
                trainerTrainerRef.current?.activateOverdrive();
              }}
            />
          )
        }
        staffXml={
          rhythm.active
            ? rhythm.exercise?.musicXml
            : reading.active
              ? reading.prompt?.musicXml
              : scoreStaffXml
        }
        staffPresentation={rhythm.active ? rhythm.presentation : reading.presentation}
        staffRetry={rhythm.active ? rhythm.retry : reading.retry}
        readingBeat={reading.prompt?.beat}
        course={practiceActive}
        prefs={displayPrefs}
        layout={screenLayout}
        onLayout={screenUpdateLayout}
        onResetLayout={screenResetLayout}
        layoutMoved={screenMoved}
        editing={!reading.active && !rhythm.active && screenEditing}
        onZoom={(zoom) => {
          updateStaffPrefs({ zoom });
        }}
        fixedLines={scoreFixedLines}
        liveBeat={trainerLiveBeat}
        onSeek={trainerSeekToBeat}
        reviewMarks={reading.active ? undefined : takesReviewMarks}
        transcription={reading.active ? undefined : takesTranscription}
        takeStaff={takesTakeStaff}
        splitDirection={takesSplitDirection}
        comparing={comparing}
        waiting={snapshotWaiting}
        hostRef={trainerHostRef}
        mirrorHostRef={viewMirrorHostRef}
      />
    </>
  );
}
