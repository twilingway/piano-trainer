import { useRef, useState } from "react";

import { LESSONS } from "./app/lessons";
import { useFallingView } from "./app/useFallingView";
import { useKeyInput } from "./app/useKeyInput";
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
import { useAutoHide } from "./ui/useAutoHide";
import { ViewToggles } from "./ui/ViewToggles";
import { Workspace } from "./ui/Workspace";

export function App() {
  /**
   * Song time practice starts from after a click on the staff; null = the beginning.
   * Kept across reloads (listen, speed, hand, mode), cleared by "Сначала" and a new song.
   */
  const startFromRef = useRef<number | null>(null);
  const { sound, ensureSound } = useSound();
  const current = useSong(startFromRef);
  const { song, songKey } = current;
  const { staffPrefs, updateStaffPrefs } = useStaffPrefs();
  const score = useStaffScore(song, current.baseSong, staffPrefs);
  const takes = useTakeReview(song, songKey, ensureSound, {
    withNames: score.withNames,
    fixedLines: score.fixedLines,
    measuresPerLine: staffPrefs.measuresPerLine
  });
  const trainer = useTrainer({
    song,
    songKey,
    startFromRef,
    ensureSound,
    onNoteClick: current.cycleFinger,
    onTake: takes.recordTake,
    compareSong: takes.compareSong,
    lastTake: takes.lastTake,
    replayCount: takes.replayCount,
    comparing: takes.comparing,
    onReplay: takes.replay
  });
  const input = useKeyInput(trainer.trainerRef);
  const view = useFallingView({
    viewRef: trainer.viewRef,
    trainerRef: trainer.trainerRef,
    trainerReady: trainer.trainerReady,
    song,
    baseSong: current.baseSong,
    staffPrefs,
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
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [resultClosed, setResultClosed] = useState(false);
  const [bar, setBar] = useState<HTMLDivElement | null>(null);
  const playing = snapshot?.playing ?? false;
  const barHidden = useAutoHide(playing && !settingsOpen && !libraryOpen, bar);
  const { board, totalQuarters, progress, ticks } = useSongProgress(
    song,
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
    startOver,
    openLibrary: () => {
      setLibraryOpen(true);
    }
  });

  const toggles = (
    <ViewToggles
      prefs={staffPrefs}
      hasScore={Boolean(score.staffXml)}
      onChange={updateStaffPrefs}
    />
  );

  const settingsTabs = [
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
          metronome={trainer.metronome}
          onMetronome={trainer.setMetronome}
          listening={listening}
          soundLoading={sound === "loading"}
          onListen={() => void trainer.toggleListening()}
          stats={stats}
          mode={trainer.mode}
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
      content: (
        <KeyboardSettings
          keyRange={view.keyRange}
          onKeyRange={view.setKeyRange}
          showLabels={view.showLabels}
          onShowLabels={view.setShowLabels}
          toggles={toggles}
        />
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
        />
      )
    }
  ];

  return (
    <div className="app">
      <div ref={setBar} className="shell-top" data-hidden={barHidden}>
        <PlayerTopBar
          title={song.title}
          hidden={barHidden}
          playing={playing}
          soundLoading={sound === "loading"}
          mode={trainer.mode}
          hands={trainer.handChoice}
          speed={trainer.speed}
          board={board}
          midi={input.midiName}
          settingsOpen={settingsOpen}
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
            setSettingsOpen((open) => !open);
          }}
        />
        <SongProgress
          progress={progress}
          ticks={ticks}
          hidden={barHidden}
          onSeek={(share) => {
            trainer.seekToBeat(share * totalQuarters);
          }}
        />
      </div>

      {library.loadError && <div className="toast toast--error">{library.loadError}</div>}

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
        staffXml={score.staffXml}
        prefs={staffPrefs}
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
          setSettingsOpen(false);
        }}
        tabs={settingsTabs}
      />

      <ResultDialog
        open={Boolean(snapshot?.finished && !listening && !comparing && stats && !resultClosed)}
        stats={stats}
        canReview={Boolean(review)}
        onClose={() => {
          setResultClosed(true);
        }}
        onAgain={startOver}
      />
    </div>
  );
}
