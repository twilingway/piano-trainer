import { useRef, useState } from "react";
import { useGameRuntime } from "./app/useGameRuntime";
import { useGameOptions } from "./app/useGameOptions";
import { useTimingControls } from "./app/useTimingControls";
import { GameSettings } from "./ui/GameSettings";
import { GameBoard } from "./ui/GameBoard";

import { downloadLesson } from "./app/lessonExport";
import { LESSONS } from "./app/lessons";
import { useFallingView } from "./app/useFallingView";
import { useFullscreen } from "./app/useFullscreen";
import { useKeyInput } from "./app/useKeyInput";
import { useComputerKeyboard } from "./app/useComputerKeyboard";
import { ComputerKeyboardSettings } from "./ui/settings/ComputerKeyboardSettings";
import { usePlayerLibrary } from "./app/usePlayerLibrary";
import { useShortcuts } from "./app/useShortcuts";
import { useSong } from "./app/useSong";
import { useSongProgress } from "./app/useSongProgress";
import { useSound } from "./app/useSound";
import { useStaffPrefs } from "./app/useStaffPrefs";
import { useStaffScore } from "./app/useStaffScore";
import { useTakeReview } from "./app/useTakeReview";
import { useTrainer } from "./app/useTrainer";
import { foldersSupported } from "./library/folder";
import { LibraryDialog } from "./ui/LibraryDialog";
import { PlayerTopBar } from "./ui/PlayerTopBar";
import { ResultDialog } from "./ui/ResultDialog";
import { ReviewBar } from "./ui/ReviewBar";
import { SettingsPanel } from "./ui/SettingsPanel";
import { KeyboardSettings } from "./ui/settings/KeyboardSettings";
import { MidiSettings } from "./ui/settings/MidiSettings";
import { PlaySettings } from "./ui/settings/PlaySettings";
import { SongSettings } from "./ui/settings/SongSettings";
import { StaffSettings } from "./ui/settings/StaffSettings";
import { SongProgress } from "./ui/SongProgress";
import { ViewToggles } from "./ui/ViewToggles";
import { Workspace } from "./ui/Workspace";
import { useWordTyping } from "./app/useWordTyping";
import { useWordTypingPointer } from "./app/useWordTypingPointer";
import { WordTypingBoard } from "./ui/WordTypingBoard";
import { WordTypingSettings } from "./ui/WordTypingSettings";
import { GameModeSwitch } from "./ui/GameModeSwitch";

export function App() {
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
  const game = useGameOptions(word.practiceKey, word.practiceSong.duration, word.enabled);
  const { staffPrefs, updateStaffPrefs } = useStaffPrefs();
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
  const computerKeyboard = useComputerKeyboard();
  const input = useKeyInput(
    trainer.trainerRef,
    word.enabled ? word.keyboardOptions : computerKeyboard.options
  );
  const wordPointer = useWordTypingPointer(
    trainer.trainerRef,
    word.result,
    word.enabled,
    libraryOpen || settingsOpen || word.pending || Boolean(word.error)
  );
  const timing = useTimingControls({
    trainerRef: trainer.trainerRef,
    ensureSound,
    devices: input.devices,
    deviceId: input.midiDeviceId,
    snapshot: trainer.snapshot,
    locked: game.ranked && (trainer.snapshot?.playing ?? false)
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
    lastTake: takes.lastTake
  });
  const library = usePlayerLibrary({
    showSong: current.showSong,
    setLibrarySource: current.setLibrarySource,
    openLesson: current.openLesson
  });

  const { snapshot, listening } = trainer;
  const { review, lastTake, comparing } = takes;
  const stats = snapshot?.stats;

  // The shell: one bar, the song's progress, windows for the library and the settings.
  const playing = snapshot?.playing ?? false;
  const { board, totalQuarters, progress, ticks } = useSongProgress(
    word.practiceSong,
    snapshot?.time ?? 0,
    trainer.speed
  );

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

  const wordSettings = (
    <WordTypingSettings
      language={word.language}
      part={word.part}
      dictionarySize={word.dictionarySize}
      locked={playing}
      onLanguage={(language) => {
        word.update({ language });
      }}
      onPart={(part) => {
        startFromRef.current = null;
        word.choosePart(part);
      }}
      onSize={(dictionarySize) => {
        word.update({ dictionarySize });
      }}
    />
  );

  const settingsTabs = [
    {
      id: "rules",
      title: "Правила",
      content: (
        <GameSettings
          practiceOnly={word.enabled}
          difficulty={game.difficulty}
          ranked={game.ranked}
          rankedReady={timing.rankedReady}
          performance={game.performance}
          stopOnError={game.stopOnError}
          locked={playing}
          from={game.range.from}
          to={game.range.to}
          duration={word.practiceSong.duration}
          loop={game.range.loop}
          onChange={game.update}
          onRange={game.updateRange}
        />
      )
    },
    { id: "timing", title: "Точность", content: timing.settings },
    {
      id: "song",
      title: "Песня",
      content: (
        <SongSettings
          sourceKey={current.sourceKey}
          transpose={current.transpose}
          onTranspose={current.setTranspose}
          fingersChanged={current.overrides.size > 0}
          onResetFingers={current.resetFingers}
        />
      )
    },
    {
      id: "play",
      title: "Игра",
      content: (
        <PlaySettings
          wordTyping={word.enabled}
          metronome={trainer.metronome}
          onMetronome={trainer.setMetronome}
          listening={listening}
          soundLoading={sound === "loading"}
          onListen={() => void trainer.toggleListening()}
          stats={stats}
          mode={trainer.mode}
          onMode={trainer.setMode}
          hands={trainer.handChoice}
          onHands={trainer.setHandChoice}
          speed={trainer.speed}
          onSpeed={trainer.setSpeed}
          autoReview={staffPrefs.autoReview}
          onAutoReview={(autoReview) => {
            updateStaffPrefs({ autoReview });
          }}
        />
      )
    },
    {
      id: "staff",
      title: "Вид нот",
      content: (
        <StaffSettings
          prefs={staffPrefs}
          hasScore={Boolean(score.staffXml)}
          onChange={updateStaffPrefs}
        />
      )
    },
    {
      id: "keys",
      title: "Клавиатура",
      content: word.enabled ? (
        <p className="setting-hint">
          В режиме «Печатать мелодию» клавиатура автоматически подстраивается под выбранную партию.
          Её диапазон и отображение задаёт режим.
        </p>
      ) : (
        <KeyboardSettings
          keyRange={view.keyRange}
          onKeyRange={view.setKeyRange}
          showLabels={view.showLabels}
          onShowLabels={view.setShowLabels}
          fps={staffPrefs.fps}
          onFps={(fps) => {
            updateStaffPrefs({ fps });
          }}
          keyStyle={staffPrefs.keyStyle}
          onKeyStyle={(keyStyle) => {
            updateStaffPrefs({ keyStyle, ...(keyStyle === "perspective" ? { road: true } : {}) });
          }}
          road={{ far: staffPrefs.roadFar, horizon: staffPrefs.roadHorizon }}
          onRoad={(road) => {
            updateStaffPrefs({
              ...(road.far === undefined ? {} : { roadFar: road.far }),
              ...(road.horizon === undefined ? {} : { roadHorizon: road.horizon })
            });
          }}
          camera={staffPrefs.camera}
          onCamera={(camera) => {
            updateStaffPrefs({ camera });
          }}
          toggles={toggles}
        />
      )
    },
    {
      id: "computer",
      title: "Ввод с ПК",
      content: word.enabled ? (
        <div>
          {wordSettings}
          <p className="setting-hint">
            Назначения строятся для всей песни. Shift и Alt — дополнительные клавиши; настройки
            обычных раскладок здесь не применяются.
          </p>
        </div>
      ) : (
        <ComputerKeyboardSettings controls={computerKeyboard} />
      )
    },
    {
      id: "midi",
      title: "Звук и MIDI",
      content: (
        <MidiSettings
          devices={input.devices}
          deviceId={input.midiDeviceId}
          onDevice={input.setMidiDeviceId}
          midiError={input.midiError}
          locked={game.ranked && playing}
        />
      )
    }
  ];

  return (
    <div
      className={`app${word.enabled ? " app--word" : ""}`}
      onClickCapture={fullscreen.onClickCapture}
    >
      <div className="shell-top">
        <PlayerTopBar
          title={song.title}
          playing={playing}
          soundLoading={
            sound === "loading" || (word.enabled && (word.pending || Boolean(word.error)))
          }
          mode={trainer.mode}
          hands={trainer.handChoice}
          speed={trainer.speed}
          board={board}
          midi={input.midiName}
          settingsOpen={settingsOpen}
          fullscreen={fullscreen.active}
          onFullscreen={() => void fullscreen.toggle()}
          toggles={toggles}
          onLibrary={() => {
            setLibraryOpen(true);
          }}
          onRestart={startOver}
          onTogglePlay={play}
          onMode={trainer.setMode}
          onHands={trainer.setHandChoice}
          onSpeed={trainer.setSpeed}
          onSettings={() => {
            computerKeyboard.endEditing();
            setSettingsOpen((open) => !open);
          }}
        />
        <SongProgress
          progress={progress}
          ticks={ticks}
          onSeek={(share) => {
            trainer.seekToBeat(share * totalQuarters);
          }}
        />
        <GameModeSwitch
          wordTyping={word.enabled}
          locked={playing}
          onChange={(enabled) => {
            computerKeyboard.endEditing();
            startFromRef.current = null;
            word.update({ enabled });
          }}
        >
          {word.enabled && wordSettings}
        </GameModeSwitch>
      </div>

      {word.storageError && (
        <div className="toast toast--error" role="status">
          {word.storageError}
        </div>
      )}

      {library.loadError && <div className="toast toast--error">{library.loadError}</div>}
      {game.ranked && !timing.rankedReady && (
        <div className="toast">
          Рейтинг недоступен: выберите устройство и выполните актуальную калибровку в настройках
          точности.
        </div>
      )}

      {fullscreen.error && (
        <div className="toast toast--error" role="status">
          {fullscreen.error}
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

      <Workspace
        wordBoard={
          word.enabled && !comparing ? (
            <WordTypingBoard
              result={word.result}
              statuses={snapshot?.noteStatuses}
              time={snapshot?.time ?? -2}
              listening={listening}
              pending={word.pending}
              error={word.error}
              song={word.line.song}
              liveTime={trainer.liveTime}
              onPress={wordPointer.press}
              onRelease={wordPointer.release}
            />
          ) : undefined
        }
        gameBoard={
          <GameBoard
            game={snapshot?.stats.game}
            mode={trainer.mode}
            playing={playing}
            onOverdrive={() => {
              trainer.trainerRef.current?.activateOverdrive();
            }}
          />
        }
        staffXml={score.staffXml}
        prefs={displayPrefs}
        fixedLines={score.fixedLines}
        beat={snapshot?.beat ?? 0}
        liveBeat={trainer.liveBeat}
        onSeek={trainer.seekToBeat}
        reviewMarks={takes.reviewMarks}
        transcription={takes.transcription}
        takeStaff={takes.takeStaff}
        splitDirection={takes.splitDirection}
        comparing={comparing}
        waiting={snapshot?.waiting ?? false}
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

      <SettingsPanel
        open={settingsOpen}
        onClose={() => {
          computerKeyboard.endEditing();
          setSettingsOpen(false);
        }}
        tabs={settingsTabs}
      />

      <ResultDialog
        open={Boolean(snapshot?.finished && !listening && !comparing && stats && !resultClosed)}
        stats={stats}
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
