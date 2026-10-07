import { useI18n } from "./useI18n";
import { usePlayChoice } from "./usePlayChoice";
import { useRuntimeCommand } from "./runtimeCommands";
import { GameModeSegment } from "../ui/GameModeSwitch";
import { WordTextPopover } from "../ui/WordTextPopover";
import { WordQuality } from "../ui/WordTypingBoard";
import { ConnectedPlayerTopBar, ConnectedSongProgress } from "./ConnectedPlayback";
import { lessonDisplayTitle } from "./lessonDisplayTitle";
import { useRuntimeSelector } from "./PlayerRuntimeProvider";

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
    inputMidiName
  } = useRuntimeSelector(
    (runtime) => ({
      sound: runtime.sound,
      settingsOpen: runtime.settingsOpen,
      song: runtime.song,
      playing: runtime.playing,
      fullscreenActive: runtime.fullscreen.active,
      currentLesson: runtime.current.lesson,
      hasArrangement: runtime.current.arrangement !== undefined,
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
      inputMidiName: runtime.input.midiName
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
          title={lessonDisplayTitle(song.title, currentLesson, t)}
          playing={playing}
          soundLoading={sound === "loading" || (wordEnabled && (wordPending || Boolean(wordError)))}
          mode={trainerMode}
          {...playChoice}
          speed={trainerSpeed}
          difficulty={hasArrangement ? { simplified, onSimplified } : undefined}
          midi={inputMidiName}
          settingsOpen={settingsOpen}
          fullscreen={fullscreenActive}
          onFullscreen={() => void fullscreenToggle()}
          toggles={<HeaderSlot name="toggles" />}
          game={<GameModeSegment wordTyping={wordEnabled} locked={playing} onChange={chooseGame} />}
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
          timing={<HeaderSlot name="timingStatus" />}
          // A phone holds the game's strip in the menu.
          menuExtra={
            <>
              <HeaderSlot name="modeSwitch" />
              {wordEnabled && <WordQuality metrics={wordResult?.metrics} />}
            </>
          }
          editing={screenEditing}
          onToggleEditing={screenToggleEditing}
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
        <ConnectedSongProgress
          source={trainerSnapshotSource}
          song={wordPracticeSong}
          speed={trainerSpeed}
          onSeek={trainerSeekToBeat}
        />
        <HeaderSlot name="modeSwitch" />
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
