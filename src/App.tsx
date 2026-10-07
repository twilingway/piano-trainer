import { useRef, useState } from "react";
import { useGameRuntime } from "./app/useGameRuntime";
import { useI18n } from "./app/useI18n";
import { lessonDisplayTitle } from "./app/lessonDisplayTitle";
import { useGameOptions } from "./app/useGameOptions";
import { useTimingControls } from "./app/useTimingControls";

import { downloadLesson } from "./app/lessonExport";
import { LESSONS } from "./app/lessons";
import { useFallingView } from "./app/useFallingView";
import { useFullscreen } from "./app/useFullscreen";
import { useKeyInput } from "./app/useKeyInput";
import { useKeyboardSettings } from "./app/useKeyboardSettings";
import { useComputerKeyboard } from "./app/useComputerKeyboard";
import { usePlayerLibrary } from "./app/usePlayerLibrary";
import { useShortcuts } from "./app/useShortcuts";
import { useSong } from "./app/useSong";
import { useSound } from "./app/useSound";
import { useScreenLayout } from "./app/useScreenLayout";
import { useStaffPrefs } from "./app/useStaffPrefs";
import { useStaffScore } from "./app/useStaffScore";
import { useTakeReview } from "./app/useTakeReview";
import { useTrainer } from "./app/useTrainer";
import { foldersSupported } from "./library/folder";
import { LibraryDialog } from "./ui/LibraryDialog";
import { ReviewBar } from "./ui/ReviewBar";
import { ViewToggles } from "./ui/ViewToggles";
import { useWordTyping, useWordTypingInterfaceLanguage } from "./app/useWordTyping";
import { WordQuality } from "./ui/WordTypingBoard";
import { WordTypingSettings } from "./ui/WordTypingSettings";
import { GameModeSegment, GameModeSwitch } from "./ui/GameModeSwitch";
import { WordTextPopover } from "./ui/WordTextPopover";
import { PracticeTimingStatus } from "./ui/PracticeTimingStatus";

import {
  ConnectedGameBoard,
  ConnectedPlayerTopBar,
  ConnectedSongProgress,
  ConnectedWorkspace,
  ConnectedWordBoard,
  ConnectedWordTicker
} from "./app/ConnectedPlayback";
import { ConnectedPlayerSettings, ConnectedResultDialog } from "./app/ConnectedSettings";
import { useDeviceRange, useRangeFit } from "./app/useDeviceRange";
import { selectTrainerStatus, sameTrainerStatus, useTrainerSelector } from "./app/trainerSnapshots";

export function App() {
  const { t } = useI18n();
  const fullscreen = useFullscreen();
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [resultClosed, setResultClosed] = useState(false);
  /**
   * Song time practice starts from after a click on the staff; null = the beginning.
   * Kept across reloads (listen, speed, hand, mode), cleared by "Сначала" and a new song.
   */
  const startFromRef = useRef<number | null>(null);
  const { sound, ensureSound } = useSound();
  const current = useSong(startFromRef);
  const { song, songKey } = current;
  const word = useWordTyping(song, songKey, libraryOpen || settingsOpen);
  const device = useDeviceRange();
  const { playable } = device;
  const game = useGameOptions(word.practiceKey, word.practiceSong.duration, word.enabled, playable);
  const { staffPrefs, updateStaffPrefs } = useStaffPrefs();
  const screen = useScreenLayout(word.enabled ? "typing" : "piano");
  const displayPrefs = game.performance
    ? {
        ...staffPrefs,
        fingers: false,
        hands: false,
        labels: false,
        noteNames: "off" as const,
        chords: false
      }
    : staffPrefs;
  const score = useStaffScore(song, current.baseSong, displayPrefs);
  const takes = useTakeReview(word.practiceSong, word.practiceKey, ensureSound, {
    withNames: score.withNames,
    fixedLines: score.fixedLines,
    measuresPerLine: staffPrefs.measuresPerLine,
    autoReview: staffPrefs.autoReview
  });
  const trainer = useTrainer({
    song: word.practiceSong,
    songKey: word.practiceKey,
    wordTyping: word.enabled,
    startFromRef,
    ensureSound,
    onNoteClick: current.cycleFinger,
    onTake: takes.recordTake,
    compareSong: takes.compareSong,
    lastTake: takes.lastTake,
    replayCount: takes.replayCount,
    comparing: takes.comparing,
    onReplay: takes.replay,
    gameOptions: game.options,
    ranked: game.ranked
  });
  const snapshot = useTrainerSelector(
    trainer.snapshotSource,
    selectTrainerStatus,
    sameTrainerStatus
  );
  useWordTypingInterfaceLanguage(word, snapshot.playing);
  const computerKeyboard = useComputerKeyboard();
  const input = useKeyInput(
    trainer.trainerRef,
    word.enabled ? word.keyboardOptions : computerKeyboard.options,
    device.intercept,
    trainer.trainerReady
  );
  const fit = useRangeFit(song.notes, trainer.playerHands, playable, current, !word.enabled);
  const timing = useTimingControls({
    trainerRef: trainer.trainerRef,
    ensureSound,
    devices: input.devices,
    deviceId: input.midiDeviceId,
    trainerReady: trainer.trainerReady,
    snapshotSource: trainer.snapshotSource,
    locked: game.ranked && snapshot.playing
  });
  useGameRuntime(trainer.trainerRef, trainer.trainerReady, {
    loop: game.range.loop,
    ranked: game.ranked,
    stopOnError: game.stopOnError,
    rankedReady: timing.rankedReady,
    performance: game.performance,
    canStart: !word.enabled || (!word.pending && !word.error),
    deviceId: timing.profile?.deviceId ?? ""
  });
  const view = useFallingView({
    hostRef: trainer.hostRef,
    hasScore: Boolean(score.staffXml),
    viewRef: trainer.viewRef,
    trainerRef: trainer.trainerRef,
    trainerReady: trainer.trainerReady,
    song: word.practiceSong,
    baseSong: word.enabled ? word.practiceSong : current.baseSong,
    staffPrefs: displayPrefs,
    updateStaffPrefs,
    fallingNames: score.nameStyle,
    comparing: takes.comparing,
    lastTake: takes.lastTake,
    computerKeys: word.keyboard,
    placement: {
      lift: screen.layout.keysLift,
      scale: screen.layout.keysScale,
      x: screen.layout.keysX,
      y: screen.layout.keysY
    }
  });
  const library = usePlayerLibrary({
    showSong: current.showSong,
    setLibrarySource: current.setLibrarySource,
    openLesson: current.openLesson
  });

  const { listening } = trainer;
  const { review, lastTake, comparing } = takes;

  // The shell: one bar, the song's progress, windows for the library and the settings.
  const playing = snapshot.playing;

  const play = () => {
    setResultClosed(false);
    void trainer.togglePlay();
  };
  const startOver = () => {
    setResultClosed(false);
    trainer.restart();
  };
  useShortcuts({
    play,
    blocked: word.enabled
      ? libraryOpen || settingsOpen || word.pending || Boolean(word.error)
      : computerKeyboard.editing
  });

  const toggles = (
    <ViewToggles
      prefs={staffPrefs}
      hasScore={Boolean(score.staffXml)}
      onChange={updateStaffPrefs}
    />
  );
  const keyboardSettings = useKeyboardSettings(view, staffPrefs, updateStaffPrefs, toggles);

  const wordSettings = (
    <WordTypingSettings
      language={word.language}
      part={word.part}
      accompaniment={word.accompaniment}
      onAccompaniment={word.setAccompaniment}
      layout={word.layout}
      onLayout={(layout) => {
        word.update({ layout });
      }}
      onRegenerate={word.regenerate}
      locked={playing}
      pending={word.pending}
      onLanguage={(language) => {
        word.update({ language });
      }}
      onPart={(part) => {
        startFromRef.current = null;
        word.choosePart(part);
      }}
    />
  );

  const chooseGame = (enabled: boolean) => {
    computerKeyboard.endEditing();
    startFromRef.current = null;
    word.update({ enabled });
  };
  const timingStatus = <PracticeTimingStatus policy={snapshot.timingPolicy} ranked={game.ranked} />;
  const modeSwitch = (
    <GameModeSwitch wordTyping={word.enabled} locked={playing} onChange={chooseGame}>
      {word.enabled && wordSettings}
      {timingStatus}
    </GameModeSwitch>
  );

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
        source={trainer.snapshotSource}
        open={settingsOpen}
        onClose={() => {
          computerKeyboard.endEditing();
          setSettingsOpen(false);
        }}
        wordTyping={word.enabled}
        play={{
          wordTyping: word.enabled,
          metronome: trainer.metronome,
          onMetronome: trainer.setMetronome,
          listening,
          soundLoading: sound === "loading",
          onListen: () => void trainer.toggleListening(),
          mode: trainer.mode,
          onMode: trainer.setMode,
          ...trainer.playChoice,
          speed: trainer.speed,
          onSpeed: trainer.setSpeed,
          autoReview: staffPrefs.autoReview,
          onAutoReview: (autoReview) => {
            updateStaffPrefs({ autoReview });
          }
        }}
        rules={{
          practiceOnly: word.enabled,
          difficulty: game.difficulty,
          ranked: game.ranked,
          rankedReady: timing.rankedReady,
          performance: game.performance,
          learningWindow: game.learningWindow,
          stopOnError: game.stopOnError,
          locked: playing,
          from: game.range.from,
          to: game.range.to,
          duration: word.practiceSong.duration,
          loop: game.range.loop,
          onChange: game.update,
          onRange: game.updateRange,
          outsideKeyboard: fit.outside
        }}
        song={{
          sourceKey: current.sourceKey,
          transpose: current.transpose,
          onTranspose: current.setTranspose,
          arrangement: current.arrangement,
          ...fit,
          fingersChanged: current.overrides.size > 0,
          onResetFingers: current.resetFingers
        }}
        staff={{
          prefs: staffPrefs,
          hasScore: Boolean(score.staffXml),
          onChange: updateStaffPrefs
        }}
        keyboard={keyboardSettings}
        computerKeyboard={computerKeyboard}
        wordSettings={wordSettings}
        midi={{
          ...input.settings,
          locked: game.ranked && playing,
          keyboard: device.controls
        }}
        synchronization={timing.settings}
        onResetLayout={screen.resetLayout}
        editing={screen.editing}
        onToggleEditing={screen.toggleEditing}
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
