import { lessonDisplayTitle } from "./lessonDisplayTitle";
import { downloadLesson } from "./lessonExport";
import { LESSONS } from "./lessons";
import { foldersSupported } from "../library/folder";
import { LibraryDialog } from "../ui/LibraryDialog";
import { ReviewBar } from "../ui/ReviewBar";
import { WordQuality } from "../ui/WordTypingBoard";
import { GameModeSegment } from "../ui/GameModeSwitch";
import { WordTextPopover } from "../ui/WordTextPopover";
import {
  ConnectedGameBoard,
  ConnectedPlayerTopBar,
  ConnectedSongProgress,
  ConnectedWorkspace,
  ConnectedWordBoard,
  ConnectedWordTicker
} from "./ConnectedPlayback";
import { ConnectedPlayerSettings, ConnectedResultDialog } from "./ConnectedSettings";
import { useRuntimeSelector } from "./PlayerRuntimeProvider";
import { PersistenceNotice } from "./PersistenceNotice";

export function PlayerScreen() {
  const {
    sound,
    displayPrefs,
    t,
    fullscreen,
    libraryOpen,
    setLibraryOpen,
    settingsOpen,
    setSettingsOpen,
    resultClosed,
    setResultClosed,
    current,
    song,
    word,
    game,
    updateStaffPrefs,
    screen,
    score,
    takes,
    trainer,
    snapshot,
    computerKeyboard,
    input,
    timing,
    view,
    library,
    listening,
    review,
    lastTake,
    comparing,
    playing,
    play,
    startOver,
    toggles,
    wordSettings,
    chooseGame,
    timingStatus,
    modeSwitch
  } = useRuntimeSelector((runtime) => runtime);
  return (
    <div
      className={`app${word.enabled ? " app--word" : ""}`}
      onClickCapture={fullscreen.onClickCapture}
    >
      <div className="shell-top">
        <ConnectedPlayerTopBar
          source={trainer.snapshotSource}
          song={word.practiceSong}
          title={lessonDisplayTitle(song.title, current.lesson, t)}
          playing={playing}
          soundLoading={
            sound === "loading" || (word.enabled && (word.pending || Boolean(word.error)))
          }
          mode={trainer.mode}
          {...trainer.playChoice}
          speed={trainer.speed}
          difficulty={current.arrangement}
          midi={input.midiName}
          settingsOpen={settingsOpen}
          fullscreen={fullscreen.active}
          onFullscreen={() => void fullscreen.toggle()}
          toggles={toggles}
          game={
            <GameModeSegment wordTyping={word.enabled} locked={playing} onChange={chooseGame} />
          }
          practice={
            word.enabled && (
              <WordTextPopover
                settings={wordSettings}
                language={word.language}
                metrics={word.result?.metrics}
                notice={word.notice}
              />
            )
          }
          timing={timingStatus}
          // A phone holds the game's strip in the menu.
          menuExtra={
            <>
              {modeSwitch}
              {word.enabled && <WordQuality metrics={word.result?.metrics} />}
            </>
          }
          editing={screen.editing}
          onToggleEditing={screen.toggleEditing}
          onLibrary={() => {
            setLibraryOpen(true);
          }}
          onRestart={startOver}
          onTogglePlay={play}
          onMode={trainer.setMode}
          onSpeed={trainer.setSpeed}
          onSettings={() => {
            computerKeyboard.endEditing();
            setSettingsOpen((open) => !open);
          }}
        />
        <ConnectedSongProgress
          source={trainer.snapshotSource}
          song={word.practiceSong}
          speed={trainer.speed}
          onSeek={trainer.seekToBeat}
        />
        {modeSwitch}
      </div>

      <PersistenceNotice />
      {word.storageError && (
        <div className="toast toast--error" role="status">
          {t(word.storageError)}
        </div>
      )}

      {library.loadError && <div className="toast toast--error">{t(library.loadError)}</div>}
      {game.ranked && !timing.rankedReady && (
        <div className="toast">
          {t(
            "Рейтинг недоступен: выберите одно устройство и откалибруйте его в разделе «Синхронизация»."
          )}
        </div>
      )}

      {fullscreen.error && (
        <div className="toast toast--error" role="status">
          {t(fullscreen.error)}
        </div>
      )}

      {review && lastTake && (
        <ReviewBar
          review={review}
          take={lastTake.take}
          takes={takes.takes}
          comparing={comparing}
          splitDirection={takes.splitDirection}
          takeStaff={takes.takeStaff}
          onSelectTake={takes.selectTake}
          onSplit={takes.setSplitDirection}
          onCompare={() => void takes.startComparing()}
          onStopComparing={() => {
            takes.setComparing(false);
          }}
          onTakeStaff={takes.setTakeStaff}
          onDownload={takes.downloadLastTake}
          onHide={takes.hideReview}
        />
      )}

      <ConnectedWorkspace
        source={trainer.snapshotSource}
        wordBoard={
          word.enabled && !comparing ? (
            <ConnectedWordBoard
              source={trainer.snapshotSource}
              result={word.result}
              listening={listening}
              pending={word.pending}
              error={word.error}
              notice={word.notice}
            />
          ) : undefined
        }
        wordTicker={
          word.enabled && !comparing ? (
            <ConnectedWordTicker
              source={trainer.snapshotSource}
              result={word.result}
              listening={listening}
              pending={word.pending}
              error={word.error}
            />
          ) : undefined
        }
        gameBoard={
          <ConnectedGameBoard
            source={trainer.snapshotSource}
            mode={trainer.mode}
            playing={playing}
            onOverdrive={() => {
              trainer.trainerRef.current?.activateOverdrive();
            }}
          />
        }
        staffXml={score.staffXml}
        prefs={displayPrefs}
        layout={screen.layout}
        onLayout={screen.updateLayout}
        onResetLayout={screen.resetLayout}
        layoutMoved={screen.moved}
        editing={screen.editing}
        onZoom={(zoom) => {
          updateStaffPrefs({ zoom });
        }}
        fixedLines={score.fixedLines}
        liveBeat={trainer.liveBeat}
        onSeek={trainer.seekToBeat}
        reviewMarks={takes.reviewMarks}
        transcription={takes.transcription}
        takeStaff={takes.takeStaff}
        splitDirection={takes.splitDirection}
        comparing={comparing}
        waiting={snapshot.waiting}
        hostRef={trainer.hostRef}
        mirrorHostRef={view.mirrorHostRef}
      />

      <LibraryDialog
        open={libraryOpen}
        onClose={() => {
          setLibraryOpen(false);
        }}
        lessons={LESSONS}
        current={current.lesson}
        currentSource={current.librarySource}
        onLesson={(exerciseId, levelId) => {
          current.openLesson({ exerciseId, levelId });
        }}
        onExportLesson={downloadLesson}
        mySongs={library.mySongs}
        onMySong={(id) => void library.openMySong(id)}
        onDeleteMySong={(id) => void library.deleteMySong(id)}
        folder={library.folder}
        foldersSupported={foldersSupported()}
        onFolderSong={(path) => void library.openFolderSong(path)}
        onChooseFolder={() => void library.chooseFolder()}
        onGrantFolder={library.grantFolder}
        onForgetFolder={() => void library.forgetFolder()}
        onOpenFile={(event) => void library.openFile(event)}
      />

      <ConnectedPlayerSettings
        open={settingsOpen}
        onClose={() => {
          computerKeyboard.endEditing();
          setSettingsOpen(false);
        }}
      />

      <ConnectedResultDialog
        source={trainer.snapshotSource}
        open={snapshot.finished && !listening && !comparing && !resultClosed}
        canReview={takes.canReview}
        onClose={() => {
          setResultClosed(true);
        }}
        onAgain={startOver}
        onReview={() => {
          takes.showReview();
          setResultClosed(true);
        }}
      />
    </div>
  );
}
