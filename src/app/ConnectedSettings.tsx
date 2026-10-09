import { shallowEqual } from "react-redux";
import type { ComponentProps } from "react";
import type { TrainerSnapshot } from "../practice/Trainer";
import type { MidiDevice } from "../input/midiInput";
import type { Language, Layout } from "../wordTyping/types";
import { GameSettings } from "../ui/GameSettings";
import { ResultDialog } from "../ui/ResultDialog";
import { TimingSettings } from "../ui/TimingSettings";
import { WordTypingSettings } from "../ui/WordTypingSettings";
import { ComputerKeyboardSettings } from "../ui/settings/ComputerKeyboardSettings";
import { KeyboardSettings } from "../ui/settings/KeyboardSettings";
import { MidiSettings } from "../ui/settings/MidiSettings";
import { PlaySettings } from "../ui/settings/PlaySettings";
import { PlayerSettings } from "../ui/settings/PlayerSettings";
import { SettingsView } from "../ui/settings/SettingsView";
import { SongSettings } from "../ui/settings/SongSettings";
import { StaffSettings } from "../ui/settings/StaffSettings";
import { useRuntimeSelector } from "./PlayerRuntimeProvider";
import { useRuntimeCommand } from "./runtimeCommands";
import { useAppSelector } from "./storeHooks";
import { useI18n } from "./useI18n";
import { usePlayChoice } from "./usePlayChoice";
import { useTrainerSelector, type TrainerSnapshotSource } from "./trainerSnapshots";

interface SourceProps {
  readonly source: TrainerSnapshotSource;
}
const selectStats = (snapshot: TrainerSnapshot | null) => snapshot?.stats;
const selectDiagnostic = (snapshot: TrainerSnapshot | null) => snapshot?.diagnostic;
const NO_DEVICES: readonly MidiDevice[] = [];

export function ConnectedPlayerSettings(props: { open: boolean; onClose: () => void }) {
  const wordTyping = useAppSelector((state) => state.preferences.word.enabled);
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
  const state = useRuntimeSelector(
    (runtime) => ({
      source: runtime.trainer.snapshotSource,
      metronome: runtime.trainer.metronome,
      listening: runtime.listening,
      soundLoading: runtime.sound === "loading",
      mode: runtime.trainer.mode,
      speed: runtime.trainer.speed
    }),
    shallowEqual
  );
  const wordTyping = useAppSelector((state) => state.preferences.word.enabled);
  const autoReview = useAppSelector((state) => state.preferences.staff.autoReview);
  const choice = usePlayChoice();
  const onMetronome = useRuntimeCommand((runtime) => runtime.trainer.setMetronome);
  const onListen = useRuntimeCommand((runtime) => runtime.trainer.toggleListening);
  const onMode = useRuntimeCommand((runtime) => runtime.trainer.setMode);
  const onSpeed = useRuntimeCommand((runtime) => runtime.trainer.setSpeed);
  const onAutoReview = useRuntimeCommand((runtime) => (autoReview: boolean) => {
    runtime.updateStaffPrefs({ autoReview });
  });
  const stats = useTrainerSelector(state.source, selectStats);
  return (
    <PlaySettings
      wordTyping={wordTyping}
      metronome={state.metronome}
      onMetronome={onMetronome}
      listening={state.listening}
      soundLoading={state.soundLoading}
      onListen={() => void onListen()}
      mode={state.mode}
      onMode={onMode}
      {...choice}
      speed={state.speed}
      onSpeed={onSpeed}
      autoReview={autoReview}
      onAutoReview={onAutoReview}
      stats={stats}
    />
  );
}
function ConnectedRulesSettings() {
  const preferences = useAppSelector((state) => state.preferences.game);
  const state = useRuntimeSelector(
    (runtime) => ({
      practiceOnly: runtime.word.enabled,
      ranked: runtime.game.ranked,
      rankedReady: runtime.timing.rankedReady,
      locked: runtime.playing,
      from: runtime.game.range.from,
      to: runtime.game.range.to,
      duration: runtime.word.practiceSong.duration,
      loop: runtime.game.range.loop,
      outsideKeyboard: runtime.fit.outside
    }),
    shallowEqual
  );
  const onChange = useRuntimeCommand((runtime) => runtime.game.update);
  const onRange = useRuntimeCommand((runtime) => runtime.game.updateRange);
  return <GameSettings {...preferences} {...state} onChange={onChange} onRange={onRange} />;
}
function ConnectedSongSettings() {
  const state = useRuntimeSelector(
    (runtime) => ({
      sourceKey: runtime.current.sourceKey,
      transpose: runtime.current.transpose,
      simplified: runtime.current.arrangement?.simplified,
      asWritten: runtime.current.arrangement?.asWritten,
      octave: runtime.fit.octave,
      outside: runtime.fit.outside,
      bestOctave: runtime.fit.bestOctave,
      fingersChanged: runtime.current.overrides.size > 0
    }),
    shallowEqual
  );
  const onTranspose = useRuntimeCommand((runtime) => runtime.current.setTranspose);
  const onOctave = useRuntimeCommand((runtime) => runtime.fit.onOctave);
  const onSimplified = useRuntimeCommand(
    (runtime) => (enabled: boolean) => runtime.current.arrangement?.onSimplified(enabled)
  );
  const onAsWritten = useRuntimeCommand(
    (runtime) => (enabled: boolean) => runtime.current.arrangement?.onAsWritten(enabled)
  );
  const onResetFingers = useRuntimeCommand((runtime) => runtime.current.resetFingers);
  return (
    <SongSettings
      {...state}
      arrangement={
        state.simplified === undefined
          ? undefined
          : {
              simplified: state.simplified,
              onSimplified,
              asWritten: state.asWritten ?? false,
              onAsWritten
            }
      }
      onTranspose={onTranspose}
      onOctave={onOctave}
      onResetFingers={onResetFingers}
    />
  );
}
function ConnectedViewSettings() {
  const wordTyping = useAppSelector((state) => state.preferences.word.enabled);
  const fps = useAppSelector((state) => state.preferences.staff.fps);
  const editing = useRuntimeSelector((runtime) => runtime.screen.editing);
  const onFps = useRuntimeCommand((runtime) => (fps: boolean) => {
    runtime.updateStaffPrefs({ fps });
  });
  const onToggleEditing = useRuntimeCommand((runtime) => runtime.screen.toggleEditing);
  const onResetLayout = useRuntimeCommand((runtime) => runtime.screen.resetLayout);
  return (
    <SettingsView
      wordTyping={wordTyping}
      staff={<ConnectedStaffSettings />}
      keyboard={<ConnectedKeyboardSettings />}
      fps={fps}
      onFps={onFps}
      editing={editing}
      onToggleEditing={onToggleEditing}
      onResetLayout={onResetLayout}
    />
  );
}
function ConnectedStaffSettings() {
  const prefs = useAppSelector((state) => state.preferences.staff);
  const hasScore = useRuntimeSelector((runtime) => Boolean(runtime.score.staffXml));
  const onChange = useRuntimeCommand((runtime) => runtime.updateStaffPrefs);
  return <StaffSettings prefs={prefs} hasScore={hasScore} onChange={onChange} />;
}
export function ConnectedSettingsToggles() {
  return useRuntimeSelector((runtime) => runtime.toggles);
}
function ConnectedKeyboardSettings() {
  const state = useAppSelector(
    (state) => ({
      keyStyle: state.preferences.staff.keyStyle,
      handStyle: state.preferences.staff.handStyle,
      far: state.preferences.staff.roadFar,
      horizon: state.preferences.staff.roadHorizon,
      camera: state.preferences.staff.camera
    }),
    shallowEqual
  );
  const view = useRuntimeSelector(
    (runtime) => ({ keyRange: runtime.view.keyRange, showLabels: runtime.view.showLabels }),
    shallowEqual
  );
  const onKeyRange = useRuntimeCommand((runtime) => runtime.view.setKeyRange);
  const onShowLabels = useRuntimeCommand((runtime) => runtime.view.setShowLabels);
  const onKeyStyle = useRuntimeCommand((runtime) => runtime.keyboardSettings.onKeyStyle);
  const onHandStyle = useRuntimeCommand((runtime) => runtime.keyboardSettings.onHandStyle);
  const onRoad = useRuntimeCommand((runtime) => runtime.keyboardSettings.onRoad);
  const onCamera = useRuntimeCommand((runtime) => runtime.keyboardSettings.onCamera);
  return (
    <KeyboardSettings
      {...view}
      keyStyle={state.keyStyle}
      handStyle={state.handStyle}
      road={{ far: state.far, horizon: state.horizon }}
      camera={state.camera}
      onKeyRange={onKeyRange}
      onShowLabels={onShowLabels}
      onKeyStyle={onKeyStyle}
      onHandStyle={onHandStyle}
      onRoad={onRoad}
      onCamera={onCamera}
      toggles={<ConnectedSettingsToggles />}
    />
  );
}
function ConnectedComputerSettings() {
  const wordTyping = useAppSelector((state) => state.preferences.word.enabled);
  const { t } = useI18n();
  return wordTyping ? (
    <>
      <ConnectedWordSettings />
      <p className="setting-hint">
        {t(
          "Клавиши назначаются под всю песню, Shift и Alt дают дополнительные ноты. Обычные раскладки здесь не действуют."
        )}
      </p>
    </>
  ) : (
    <ConnectedKeyboardAssignments />
  );
}
export function ConnectedWordSettings() {
  const preferences = useAppSelector((state) => state.preferences.word);
  const state = useRuntimeSelector(
    (runtime) => ({
      part: runtime.word.part,
      locked: runtime.playing,
      pending: runtime.word.pending
    }),
    shallowEqual
  );
  const onAccompaniment = useRuntimeCommand((runtime) => runtime.word.setAccompaniment);
  const onLanguage = useRuntimeCommand((runtime) => (language: Language) => {
    runtime.word.update({ language });
  });
  const onLayout = useRuntimeCommand((runtime) => (layout: Layout) => {
    runtime.word.update({ layout });
  });
  const onPart = useRuntimeCommand((runtime) => runtime.chooseWordPart);
  const onRegenerate = useRuntimeCommand((runtime) => runtime.word.regenerate);
  return (
    <WordTypingSettings
      language={preferences.language}
      accompaniment={preferences.accompaniment}
      layout={preferences.layout}
      {...state}
      onAccompaniment={onAccompaniment}
      onLanguage={onLanguage}
      onLayout={onLayout}
      onPart={onPart}
      onRegenerate={onRegenerate}
    />
  );
}
function ConnectedKeyboardAssignments() {
  const prefs = useAppSelector((state) => state.preferences.keyboard);
  const state = useRuntimeSelector(
    (runtime) => ({
      bindings: runtime.computerKeyboard.bindings,
      options: runtime.computerKeyboard.options,
      error: runtime.computerKeyboard.error,
      capturedCode: runtime.computerKeyboard.capturedCode,
      capturing: runtime.computerKeyboard.capturing,
      editing: runtime.computerKeyboard.editing
    }),
    shallowEqual
  );
  const choosePreset = useRuntimeCommand((runtime) => runtime.computerKeyboard.choosePreset);
  const assign = useRuntimeCommand((runtime) => runtime.computerKeyboard.assign);
  const reset = useRuntimeCommand((runtime) => runtime.computerKeyboard.reset);
  const beginEditing = useRuntimeCommand((runtime) => runtime.computerKeyboard.beginEditing);
  const endEditing = useRuntimeCommand((runtime) => runtime.computerKeyboard.endEditing);
  const beginCapture = useRuntimeCommand((runtime) => runtime.computerKeyboard.beginCapture);
  const cancelCapture = useRuntimeCommand((runtime) => runtime.computerKeyboard.cancelCapture);
  return (
    <ComputerKeyboardSettings
      controls={{
        prefs,
        ...state,
        choosePreset,
        assign,
        reset,
        beginEditing,
        endEditing,
        beginCapture,
        cancelCapture
      }}
    />
  );
}
function ConnectedMidiSettings() {
  const range = useAppSelector((state) => state.preferences.deviceRange);
  const choice = useAppSelector((state) => state.preferences.midiOutput);
  const lights = useAppSelector((state) => state.preferences.keyLights);
  const state = useRuntimeSelector(
    (runtime) => ({
      devices: runtime.input.devices,
      deviceId: runtime.input.midiDeviceId,
      midiError: runtime.input.midiError,
      locked: runtime.game.ranked && runtime.playing,
      capture: runtime.device.capture,
      hasOutput: runtime.input.settings.output !== undefined,
      outputDevices: runtime.input.settings.output?.devices ?? NO_DEVICES,
      connected: runtime.input.settings.output?.connected ?? false,
      selectedId: runtime.input.settings.output?.selectedId ?? ""
    }),
    shallowEqual
  );
  const onDevice = useRuntimeCommand((runtime) => runtime.input.setMidiDeviceId);
  const onRange = useRuntimeCommand((runtime) => runtime.device.setRange);
  const onCapture = useRuntimeCommand((runtime) => runtime.device.startCapture);
  const onCancelCapture = useRuntimeCommand((runtime) => runtime.device.cancelCapture);
  const onSelect = useRuntimeCommand(
    (runtime) => (id: string) => runtime.input.settings.output?.onSelect(id)
  );
  const onTest = useRuntimeCommand((runtime) => () => runtime.input.settings.output?.onTest());
  const onLights = useRuntimeCommand(
    (runtime) => (next: typeof lights) => runtime.input.settings.output?.onLights(next)
  );
  return (
    <MidiSettings
      devices={state.devices}
      deviceId={state.deviceId}
      midiError={state.midiError}
      locked={state.locked}
      onDevice={onDevice}
      keyboard={{ range, capture: state.capture, onRange, onCapture, onCancelCapture }}
      output={
        state.hasOutput
          ? {
              devices: state.outputDevices,
              choice,
              connected: state.connected,
              selectedId: state.selectedId,
              lights,
              onSelect,
              onTest,
              onLights
            }
          : undefined
      }
    />
  );
}
function ConnectedSynchronizationSettings() {
  const preferences = useAppSelector((state) => state.preferences.timing);
  const state = useRuntimeSelector(
    (runtime) => ({
      source: runtime.timing.snapshotSource,
      deviceId: runtime.timing.settingsProps.deviceId,
      deviceName: runtime.timing.settingsProps.deviceName,
      transport: runtime.timing.settingsProps.transport,
      profile: runtime.timing.settingsProps.profile,
      progress: runtime.timing.settingsProps.progress,
      running: runtime.timing.settingsProps.running,
      locked: runtime.timing.settingsProps.locked,
      canCalibrate: runtime.timing.settingsProps.canCalibrate
    }),
    shallowEqual
  );
  const onTransport = useRuntimeCommand((runtime) => runtime.timing.settingsProps.onTransport);
  const onOffsets = useRuntimeCommand((runtime) => runtime.timing.settingsProps.onOffsets);
  const onStart = useRuntimeCommand((runtime) => runtime.timing.settingsProps.onStart);
  const onCancel = useRuntimeCommand((runtime) => runtime.timing.settingsProps.onCancel);
  const { profile, ...props } = state;
  return (
    <ConnectedTimingSettings
      {...props}
      preferences={preferences}
      {...(profile ? { profile } : {})}
      onTransport={onTransport}
      onOffsets={onOffsets}
      onStart={onStart}
      onCancel={onCancel}
    />
  );
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
