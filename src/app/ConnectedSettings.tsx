import { shallowEqual } from "react-redux";
import { useRuntimeSelector } from "./PlayerRuntimeProvider";
import { useI18n } from "./useI18n";
import { GameSettings } from "../ui/GameSettings";
import { SongSettings } from "../ui/settings/SongSettings";
import { SettingsView } from "../ui/settings/SettingsView";
import { StaffSettings } from "../ui/settings/StaffSettings";
import { KeyboardSettings } from "../ui/settings/KeyboardSettings";
import { ComputerKeyboardSettings } from "../ui/settings/ComputerKeyboardSettings";
import { MidiSettings } from "../ui/settings/MidiSettings";
import type { ComponentProps } from "react";
import type { TrainerSnapshot } from "../practice/Trainer";
import { ResultDialog } from "../ui/ResultDialog";
import { TimingSettings } from "../ui/TimingSettings";
import { PlaySettings } from "../ui/settings/PlaySettings";
import { PlayerSettings } from "../ui/settings/PlayerSettings";
import { useTrainerSelector, type TrainerSnapshotSource } from "./trainerSnapshots";

interface SourceProps {
  readonly source: TrainerSnapshotSource;
}
const selectStats = (snapshot: TrainerSnapshot | null) => snapshot?.stats;
const selectDiagnostic = (snapshot: TrainerSnapshot | null) => snapshot?.diagnostic;
export function ConnectedPlayerSettings(props: { open: boolean; onClose: () => void }) {
  const wordTyping = useRuntimeSelector((runtime) => runtime.word.enabled);
  return (
    <PlayerSettings
      {...props}
      wordTyping={wordTyping}
      play={<ConnectedPlaySettings />}
      rules={<ConnectedRulesSettings />}
      song={<ConnectedSongSettings />}
      view={<ConnectedViewSettings />}
      computer={<ConnectedComputerSettings />}
      midi={<ConnectedMidiSettings />}
      synchronization={<ConnectedSynchronizationSettings />}
    />
  );
}
function ConnectedPlaySettings() {
  const { trainer, word, listening, sound, staffPrefs, updateStaffPrefs } = useRuntimeSelector(
    (runtime) => ({
      trainer: runtime.trainer,
      word: runtime.word,
      listening: runtime.listening,
      sound: runtime.sound,
      staffPrefs: runtime.staffPrefs,
      updateStaffPrefs: runtime.updateStaffPrefs
    }),
    shallowEqual
  );
  const stats = useTrainerSelector(trainer.snapshotSource, selectStats);
  return (
    <PlaySettings
      wordTyping={word.enabled}
      metronome={trainer.metronome}
      onMetronome={trainer.setMetronome}
      listening={listening}
      soundLoading={sound === "loading"}
      onListen={() => void trainer.toggleListening()}
      mode={trainer.mode}
      onMode={trainer.setMode}
      {...trainer.playChoice}
      speed={trainer.speed}
      onSpeed={trainer.setSpeed}
      autoReview={staffPrefs.autoReview}
      onAutoReview={(autoReview) => {
        updateStaffPrefs({ autoReview });
      }}
      stats={stats}
    />
  );
}
function ConnectedRulesSettings() {
  const { word, game, timing, playing, fit } = useRuntimeSelector(
    (runtime) => ({
      word: runtime.word,
      game: runtime.game,
      timing: runtime.timing,
      playing: runtime.playing,
      fit: runtime.fit
    }),
    shallowEqual
  );
  return (
    <GameSettings
      practiceOnly={word.enabled}
      difficulty={game.difficulty}
      ranked={game.ranked}
      rankedReady={timing.rankedReady}
      performance={game.performance}
      learningWindow={game.learningWindow}
      stopOnError={game.stopOnError}
      locked={playing}
      from={game.range.from}
      to={game.range.to}
      duration={word.practiceSong.duration}
      loop={game.range.loop}
      onChange={game.update}
      onRange={game.updateRange}
      outsideKeyboard={fit.outside}
    />
  );
}
function ConnectedSongSettings() {
  const { current, fit } = useRuntimeSelector(
    (runtime) => ({ current: runtime.current, fit: runtime.fit }),
    shallowEqual
  );
  return (
    <SongSettings
      sourceKey={current.sourceKey}
      transpose={current.transpose}
      onTranspose={current.setTranspose}
      arrangement={current.arrangement}
      {...fit}
      fingersChanged={current.overrides.size > 0}
      onResetFingers={current.resetFingers}
    />
  );
}
function ConnectedViewSettings() {
  const { staffPrefs, updateStaffPrefs, score, keyboardSettings, screen, word } =
    useRuntimeSelector(
      (runtime) => ({
        staffPrefs: runtime.staffPrefs,
        updateStaffPrefs: runtime.updateStaffPrefs,
        score: runtime.score,
        keyboardSettings: runtime.keyboardSettings,
        screen: runtime.screen,
        word: runtime.word
      }),
      shallowEqual
    );
  return (
    <SettingsView
      wordTyping={word.enabled}
      staff={
        <StaffSettings
          prefs={staffPrefs}
          hasScore={Boolean(score.staffXml)}
          onChange={updateStaffPrefs}
        />
      }
      keyboard={<KeyboardSettings {...keyboardSettings} />}
      fps={staffPrefs.fps}
      onFps={(fps) => {
        updateStaffPrefs({ fps });
      }}
      editing={screen.editing}
      onToggleEditing={screen.toggleEditing}
      onResetLayout={screen.resetLayout}
    />
  );
}
function ConnectedComputerSettings() {
  const { word, wordSettings, computerKeyboard } = useRuntimeSelector(
    (runtime) => ({
      word: runtime.word,
      wordSettings: runtime.wordSettings,
      computerKeyboard: runtime.computerKeyboard
    }),
    shallowEqual
  );
  const { t } = useI18n();
  return word.enabled ? (
    <>
      {wordSettings}
      <p className="setting-hint">
        {t(
          "Клавиши назначаются под всю песню, Shift и Alt дают дополнительные ноты. Обычные раскладки здесь не действуют."
        )}
      </p>
    </>
  ) : (
    <ComputerKeyboardSettings controls={computerKeyboard} />
  );
}
function ConnectedMidiSettings() {
  const { input, game, playing, device } = useRuntimeSelector(
    (runtime) => ({
      input: runtime.input,
      game: runtime.game,
      playing: runtime.playing,
      device: runtime.device
    }),
    shallowEqual
  );
  return (
    <MidiSettings {...input.settings} locked={game.ranked && playing} keyboard={device.controls} />
  );
}
function ConnectedSynchronizationSettings() {
  return useRuntimeSelector((runtime) => runtime.timing.settings);
}

export function ConnectedResultDialog({
  source,
  ...props
}: SourceProps & Omit<ComponentProps<typeof ResultDialog>, "stats">) {
  return props.open ? <LiveResultDialog source={source} {...props} /> : null;
}
function LiveResultDialog({
  source,
  ...props
}: SourceProps & Omit<ComponentProps<typeof ResultDialog>, "stats">) {
  const stats = useTrainerSelector(source, selectStats);
  return <ResultDialog {...props} stats={stats} />;
}

export function ConnectedTimingSettings({
  source,
  ...props
}: SourceProps & Omit<ComponentProps<typeof TimingSettings>, "diagnostic">) {
  const diagnostic = useTrainerSelector(source, selectDiagnostic);
  return <TimingSettings {...props} {...(diagnostic ? { diagnostic } : {})} />;
}
