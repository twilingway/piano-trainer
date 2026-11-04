import { ConnectedGuidedPath } from "./ConnectedGuidedPath";
import { SONG_COURSE_SOURCES } from "../songCourse/catalog";
import { SongCoursePath } from "../ui/SongCoursePath";
import type { LibraryWindowKind } from "./useLibraryNavigation";
import { GuidedCatalog } from "../ui/GuidedCatalog";
import { ConnectedMusicCards } from "./ConnectedMusicCourse";
import { shallowEqual } from "react-redux";
import { useState } from "react";
import { WindowViewMemory } from "../ui/windowViewMemory";
import { foldersSupported } from "../library/folder";
import { LibraryDialog } from "../ui/LibraryDialog";
import { ResultStats } from "../ui/ResultStats";
import type { PracticeStats } from "../practice/session";
import { ConnectedPlayerSettings, ConnectedResultDialog } from "./ConnectedSettings";
import { downloadLesson } from "./lessonExport";
import { LESSONS } from "./lessons";
import { PREVIOUS_COURSE_LESSONS } from "./courseCatalog";
import { ConnectedCourseCards } from "./ConnectedCourse";
import { ConnectedReadingCard } from "./ConnectedReading";
import { ConnectedBassReadingCard } from "./ConnectedBassReading";
import { ConnectedTwoHandCard } from "./ConnectedTwoHand";
import { ConnectedHeldBassCard } from "./ConnectedHeldBass";
import { ConnectedIndependentRhythmCard } from "./ConnectedIndependentRhythm";
import { ConnectedRhythmCard } from "./ConnectedRhythm";
import { ConnectedIntervalCard } from "./ConnectedIntervals";
import { phraseCompleted, nextSelection } from "../course/model";
import { useRuntimeSelector } from "./PlayerRuntimeProvider";
import { useRuntimeCommand } from "./runtimeCommands";

export function ConnectedPlayerWindows() {
  const [libraryMemories] = useState(() => ({
    lessons: new WindowViewMemory(),
    melodies: new WindowViewMemory()
  }));
  const {
    libraryOpen,
    libraryKind,
    settingsOpen,
    finished,
    playing,
    songKey,
    resultClosed,
    listening,
    comparing,
    source,
    canReview,
    courseActive,
    courseProgress,
    readingActive
  } = useRuntimeSelector(
    (runtime) => ({
      libraryOpen: runtime.libraryOpen,
      libraryKind: runtime.libraryNavigation.kind,
      settingsOpen: runtime.settingsOpen,
      finished: runtime.snapshot.finished,
      playing: runtime.snapshot.playing,
      songKey: runtime.current.songKey,
      resultClosed: runtime.resultClosed,
      listening: runtime.listening,
      comparing: runtime.comparing,
      source: runtime.trainer.snapshotSource,
      canReview: runtime.takes.canReview,
      courseActive: runtime.course.active,
      courseProgress: runtime.course.saved.progress,
      readingActive: runtime.practiceActive
    }),
    shallowEqual
  );
  const setLibraryOpen = useRuntimeCommand((runtime) => runtime.setLibraryOpen);
  const setSettingsOpen = useRuntimeCommand((runtime) => runtime.setSettingsOpen);
  const setResultClosed = useRuntimeCommand((runtime) => runtime.setResultClosed);
  const endEditing = useRuntimeCommand((runtime) => runtime.computerKeyboard.endEditing);
  const startOver = useRuntimeCommand((runtime) => runtime.startOver);
  const showReview = useRuntimeCommand((runtime) => runtime.takes.showReview);
  const openCourse = useRuntimeCommand((runtime) => runtime.course.controller.open);
  // The details of the finished take, copied when they opened: compare replays the take as a song.
  const [statsView, setStatsView] = useState<{
    readonly stats: PracticeStats;
    readonly songKey: string;
  } | null>(null);
  if (statsView && playing && !comparing) setStatsView(null);
  const again = () => {
    setStatsView(null);
    startOver();
  };
  const review = () => {
    showReview();
    setResultClosed(true);
  };
  const nextCourse =
    courseActive &&
    phraseCompleted(
      courseActive.lesson,
      courseActive.selection.stage,
      courseActive.phrase,
      courseProgress
    )
      ? nextSelection(courseActive.lesson, courseActive.selection)
      : null;
  return (
    <>
      {libraryOpen && (
        <ConnectedLibraryWindow
          key={libraryKind}
          kind={libraryKind}
          memory={libraryMemories[libraryKind]}
          onClose={() => {
            setLibraryOpen(false);
          }}
        />
      )}
      <ConnectedPlayerSettings
        open={settingsOpen}
        onClose={() => {
          endEditing();
          setSettingsOpen(false);
        }}
      />
      <ConnectedResultDialog
        source={source}
        open={!readingActive && finished && !listening && !comparing && !resultClosed}
        canReview={canReview}
        course={courseActive !== null}
        onClose={() => {
          setResultClosed(true);
        }}
        onAgain={again}
        {...(nextCourse
          ? {
              onNext: () => {
                setResultClosed(true);
                openCourse(nextCourse);
              }
            }
          : {})}
        onReview={review}
        onStats={(stats) => {
          setResultClosed(true);
          setStatsView({ stats, songKey });
        }}
      />
      {statsView?.songKey === songKey && (
        <ResultStats
          stats={statsView.stats}
          canReview={canReview}
          onClose={() => {
            setStatsView(null);
          }}
          onAgain={again}
          onReview={review}
        />
      )}
    </>
  );
}
function ConnectedLibraryWindow({
  onClose,
  memory,
  kind
}: {
  onClose: () => void;
  memory: WindowViewMemory;
  kind: LibraryWindowKind;
}) {
  const { lesson, source, mySongs, folder, songCourseView } = useRuntimeSelector(
    (runtime) => ({
      lesson: runtime.current.lesson,
      source: runtime.current.librarySource,
      mySongs: runtime.library.mySongs,
      folder: runtime.library.folder,
      songCourseView: runtime.songCourse.view
    }),
    shallowEqual
  );
  const chooseSongCourse = useRuntimeCommand(
    (runtime) => (songId: string, nodeId: string) =>
      runtime.songCourse.controller.choose(songId, nodeId)
  );
  const openLesson = useRuntimeCommand((runtime) => runtime.current.openLesson);
  const openMySong = useRuntimeCommand((runtime) => runtime.library.openMySong);
  const deleteMySong = useRuntimeCommand((runtime) => runtime.library.deleteMySong);
  const openFolderSong = useRuntimeCommand((runtime) => runtime.library.openFolderSong);
  const chooseFolder = useRuntimeCommand((runtime) => runtime.library.chooseFolder);
  const grantFolder = useRuntimeCommand((runtime) => runtime.library.grantFolder);
  const forgetFolder = useRuntimeCommand((runtime) => runtime.library.forgetFolder);
  const openFile = useRuntimeCommand((runtime) => runtime.library.openFile);
  return (
    <LibraryDialog
      open
      kind={kind}
      viewMemory={memory}
      onClose={onClose}
      lessons={LESSONS.filter((lesson) => lesson.id === "five-finger-c" || lesson.id === "scale-c")}
      melodies={LESSONS.filter(
        (lesson) =>
          lesson.id !== "five-finger-c" &&
          lesson.id !== "scale-c" &&
          !PREVIOUS_COURSE_LESSONS.includes(lesson)
      )}
      previousLessons={PREVIOUS_COURSE_LESSONS}
      course={
        kind === "lessons" ? (
          <SongCoursePath
            sources={SONG_COURSE_SOURCES}
            selection={songCourseView.progressState.selection}
            results={songCourseView.progressState.results}
            pending={!songCourseView.loaded}
            error={
              songCourseView.error ??
              (songCourseView.storageError ? "Прогресс мелодий временно недоступен." : null)
            }
            onChoose={(songId, nodeId) => {
              if (chooseSongCourse(songId, nodeId)) onClose();
            }}
          />
        ) : null
      }
      legacyCourse={
        kind === "lessons" ? (
          <>
            <ConnectedGuidedPath onChoose={onClose} />
            <GuidedCatalog>
              <div className="foundation-course-catalog">
                <ConnectedReadingCard onChoose={onClose} />
                <ConnectedBassReadingCard onChoose={onClose} />
                <ConnectedIntervalCard onChoose={onClose} />
                <ConnectedRhythmCard onChoose={onClose} />
                <ConnectedTwoHandCard onChoose={onClose} />
                <ConnectedHeldBassCard onChoose={onClose} />
                <ConnectedIndependentRhythmCard onChoose={onClose} />
                <ConnectedMusicCards onChoose={onClose} />
              </div>
            </GuidedCatalog>
            <ConnectedCourseCards onChoose={onClose} />
          </>
        ) : null
      }
      current={lesson}
      currentSource={source}
      onLesson={(exerciseId, levelId) => {
        openLesson({ exerciseId, levelId });
      }}
      onExportLesson={downloadLesson}
      mySongs={mySongs}
      onMySong={(id) => void openMySong(id)}
      onDeleteMySong={(id) => void deleteMySong(id)}
      folder={folder}
      foldersSupported={foldersSupported()}
      onFolderSong={(path) => void openFolderSong(path)}
      onChooseFolder={() => void chooseFolder()}
      onGrantFolder={grantFolder}
      onForgetFolder={() => void forgetFolder()}
      onOpenFile={(event) => void openFile(event)}
    />
  );
}
