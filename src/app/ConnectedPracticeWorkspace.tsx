import { useRuntimeCommand } from "./runtimeCommands";
import {
  ConnectedGameBoard,
  ConnectedWordBoard,
  ConnectedWordTicker,
  ConnectedWorkspace
} from "./ConnectedPlayback";
import { useRuntimeSelector } from "./PlayerRuntimeProvider";
import { ConnectedCourseLessonBar, ConnectedPianoTabs } from "./ConnectedCourse";

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
    courseTopView
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
      courseTabs:
        runtime.course.active !== null &&
        (runtime.course.saved.view === "tabs" || runtime.course.saved.view === "both") &&
        !runtime.comparing,
      courseTopView: runtime.course.saved.topView
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
      {!wordEnabled && !comparing && <ConnectedCourseLessonBar />}
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
          <ConnectedGameBoard
            source={trainerSnapshotSource}
            mode={trainerMode}
            playing={playing}
            onOverdrive={() => {
              trainerTrainerRef.current?.activateOverdrive();
            }}
          />
        }
        staffXml={scoreStaffXml}
        prefs={displayPrefs}
        layout={screenLayout}
        onLayout={screenUpdateLayout}
        onResetLayout={screenResetLayout}
        layoutMoved={screenMoved}
        editing={screenEditing}
        onZoom={(zoom) => {
          updateStaffPrefs({ zoom });
        }}
        fixedLines={scoreFixedLines}
        liveBeat={trainerLiveBeat}
        onSeek={trainerSeekToBeat}
        reviewMarks={takesReviewMarks}
        transcription={takesTranscription}
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
