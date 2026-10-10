import { shallowEqual } from "react-redux";
import { foldersSupported } from "../library/folder";
import { LibraryDialog } from "../ui/LibraryDialog";
import { ConnectedPlayerSettings, ConnectedResultDialog } from "./ConnectedSettings";
import { downloadLesson } from "./lessonExport";
import { LESSONS } from "./lessons";
import { PREVIOUS_COURSE_LESSONS } from "./courseCatalog";
import { ConnectedCourseCards } from "./ConnectedCourse";
import { ConnectedReadingCard } from "./ConnectedReading";
import { phraseCompleted, nextSelection } from "../course/model";
import { useRuntimeSelector } from "./PlayerRuntimeProvider";
import { useRuntimeCommand } from "./runtimeCommands";

export function ConnectedPlayerWindows() {
  const {
    libraryOpen,
    settingsOpen,
    finished,
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
      settingsOpen: runtime.settingsOpen,
      finished: runtime.snapshot.finished,
      resultClosed: runtime.resultClosed,
      listening: runtime.listening,
      comparing: runtime.comparing,
      source: runtime.trainer.snapshotSource,
      canReview: runtime.takes.canReview,
      courseActive: runtime.course.active,
      courseProgress: runtime.course.saved.progress,
      readingActive: runtime.reading.active
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
        onAgain={startOver}
        {...(nextCourse
          ? {
              onNext: () => {
                setResultClosed(true);
                openCourse(nextCourse);
              }
            }
          : {})}
        onReview={() => {
          showReview();
          setResultClosed(true);
        }}
      />
    </>
  );
}
function ConnectedLibraryWindow({ onClose }: { onClose: () => void }) {
  const { lesson, source, mySongs, folder } = useRuntimeSelector(
    (runtime) => ({
      lesson: runtime.current.lesson,
      source: runtime.current.librarySource,
      mySongs: runtime.library.mySongs,
      folder: runtime.library.folder
    }),
    shallowEqual
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
      onClose={onClose}
      lessons={LESSONS.filter((lesson) => !PREVIOUS_COURSE_LESSONS.includes(lesson))}
      previousLessons={PREVIOUS_COURSE_LESSONS}
      course={
        <>
          <ConnectedReadingCard onChoose={onClose} />
          <ConnectedCourseCards onChoose={onClose} />
        </>
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
