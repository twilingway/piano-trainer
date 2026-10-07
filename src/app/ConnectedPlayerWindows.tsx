import { shallowEqual } from "react-redux";
import { foldersSupported } from "../library/folder";
import { LibraryDialog } from "../ui/LibraryDialog";
import { ConnectedPlayerSettings, ConnectedResultDialog } from "./ConnectedSettings";
import { downloadLesson } from "./lessonExport";
import { LESSONS } from "./lessons";
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
    canReview
  } = useRuntimeSelector(
    (runtime) => ({
      libraryOpen: runtime.libraryOpen,
      settingsOpen: runtime.settingsOpen,
      finished: runtime.snapshot.finished,
      resultClosed: runtime.resultClosed,
      listening: runtime.listening,
      comparing: runtime.comparing,
      source: runtime.trainer.snapshotSource,
      canReview: runtime.takes.canReview
    }),
    shallowEqual
  );
  const setLibraryOpen = useRuntimeCommand((runtime) => runtime.setLibraryOpen);
  const setSettingsOpen = useRuntimeCommand((runtime) => runtime.setSettingsOpen);
  const setResultClosed = useRuntimeCommand((runtime) => runtime.setResultClosed);
  const endEditing = useRuntimeCommand((runtime) => runtime.computerKeyboard.endEditing);
  const startOver = useRuntimeCommand((runtime) => runtime.startOver);
  const showReview = useRuntimeCommand((runtime) => runtime.takes.showReview);
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
        open={finished && !listening && !comparing && !resultClosed}
        canReview={canReview}
        onClose={() => {
          setResultClosed(true);
        }}
        onAgain={startOver}
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
      lessons={LESSONS}
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
