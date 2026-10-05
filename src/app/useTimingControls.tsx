import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { audioTime, cancelScheduledSound, scheduleSound, soundClick } from "../audio/pianoSound";
import type { KeyEvent, MidiDevice } from "../input/midiInput";
import type { ConnectionType } from "../practice/calibration";
import type { Trainer } from "../practice/Trainer";
import { ConnectedTimingSettings } from "./ConnectedSettings";
import type { TrainerSnapshotSource } from "./trainerSnapshots";
import {
  calibrationIsCurrent,
  getTimingProfile,
  loadTimingPreferences,
  saveTimingPreferences,
  updateTimingProfile,
  type TimingPreferences
} from "./timingPreferences";
import { useCalibration } from "./useCalibration";

interface Options {
  trainerRef: RefObject<Trainer | null>;
  ensureSound: () => Promise<void>;
  devices: readonly MidiDevice[];
  deviceId: string;
  trainerReady: boolean;
  snapshotSource: TrainerSnapshotSource;
  locked?: boolean;
}
export function useTimingControls({
  trainerRef,
  ensureSound,
  devices,
  deviceId,
  trainerReady,
  snapshotSource,
  locked = false
}: Options) {
  const [preferences, setPreferences] = useState(loadTimingPreferences);
  const selected =
    devices.find((device) => device.id === deviceId) ??
    (deviceId === "all" && devices.length === 1 ? devices[0] : undefined);
  const local = devices.length === 0;
  const chosenId = local ? "keyboard" : String(selected?.id ?? "");
  const chosenName = local
    ? "Компьютерная клавиатура / экран"
    : (selected?.name ?? "Выберите одно MIDI-устройство");
  const transport: ConnectionType = local ? "local" : (preferences.transports[chosenId] ?? "usb");
  const profile = getTimingProfile(preferences, chosenId, transport);
  const audioJobs = useRef<number[]>([]);
  const request = useRef(0);
  const clearAudio = useCallback(() => {
    for (const job of audioJobs.current) cancelScheduledSound(job);
    audioJobs.current = [];
  }, []);
  const playBeat = useCallback(
    (timestamp: number) => {
      const at = audioTime() + (timestamp - performance.now() - preferences.audioOffsetMs) / 1000;
      audioJobs.current.push(
        scheduleSound(at, (audioSeconds) => {
          soundClick(false, audioSeconds);
        })
      );
    },
    [preferences.audioOffsetMs]
  );
  const {
    cancel: cancelCalibration,
    start: startCalibration,
    capture,
    progress,
    running
  } = useCalibration({
    audioOffsetMs: preferences.audioOffsetMs,
    audioOutputId: preferences.audioOutputId,
    playBeat,
    onComplete: (result, audio) => {
      clearAudio();
      setPreferences((current) =>
        updateTimingProfile(current, {
          ...result,
          ...audio,
          deviceId: chosenId,
          deviceName: chosenName,
          transport
        })
      );
    }
  });
  const cancel = useCallback(() => {
    request.current++;
    cancelCalibration();
    clearAudio();
  }, [cancelCalibration, clearAudio]);
  useEffect(() => {
    saveTimingPreferences(preferences);
  }, [preferences]);
  useEffect(
    () => () => {
      request.current++;
      clearAudio();
    },
    [clearAudio]
  );
  // Reconnecting or changing transport must never mix samples from different profiles.
  useEffect(() => {
    cancel();
  }, [chosenId, transport, cancel]);
  useEffect(() => {
    if (!running) clearAudio();
  }, [running, clearAudio]);
  const start = async () => {
    if (!chosenId || locked) return;
    const token = ++request.current;
    trainerRef.current?.setPlaying(false);
    await ensureSound();
    if (request.current === token) startCalibration();
  };
  const intercept = useCallback(
    (event: KeyEvent): boolean => {
      if (!running) return false;
      const matches = local
        ? event.source !== "midi"
        : event.source === "midi" && event.deviceId === chosenId;
      if (matches && event.type === "down")
        capture(event.pitch, event.timestamp ?? performance.now());
      return true;
    },
    [running, local, chosenId, capture]
  );
  useLayoutEffect(() => {
    const trainer = trainerRef.current;
    if (!trainer) return;
    const inputOffsets: Record<string, number> = {};
    for (const device of devices) {
      const connection = preferences.transports[device.id] ?? "usb";
      inputOffsets[device.id] =
        getTimingProfile(preferences, device.id, connection)?.inputOffsetMs ?? 0;
    }
    const localOffset = getTimingProfile(preferences, "keyboard", "local")?.inputOffsetMs ?? 0;
    inputOffsets.keyboard = localOffset;
    inputOffsets.pointer = localOffset;
    trainer.configureTiming({
      inputOffsets,
      manualInputOffsetMs: preferences.manualOffsetMs,
      audioOffsetMs: preferences.audioOffsetMs,
      visualOffsetMs: preferences.visualOffsetMs
    });
  }, [trainerRef, trainerReady, devices, preferences]);
  useLayoutEffect(() => {
    const trainer = trainerRef.current;
    if (!trainer) return;
    trainer.onInput = intercept;
    return () => {
      if (trainer.onInput === intercept) trainer.onInput = undefined;
    };
  }, [trainerRef, trainerReady, intercept]);
  const onTransport = (value: ConnectionType) => {
    if (locked || running || !chosenId) return;
    setPreferences((current) => ({
      ...current,
      transports: { ...current.transports, [chosenId]: local ? "local" : value }
    }));
  };
  const onOffsets = (
    values: Partial<
      Pick<
        TimingPreferences,
        "manualOffsetMs" | "audioOffsetMs" | "visualOffsetMs" | "audioOutputId"
      >
    >
  ) => {
    if (!locked && !running) setPreferences((current) => ({ ...current, ...values }));
  };
  const settings = (
    <ConnectedTimingSettings
      source={snapshotSource}
      preferences={preferences}
      deviceId={chosenId}
      deviceName={chosenName}
      transport={transport}
      {...(profile ? { profile } : {})}
      progress={progress}
      running={running}
      locked={locked}
      canCalibrate={!!chosenId}
      onTransport={onTransport}
      onOffsets={onOffsets}
      onStart={() => {
        void start();
      }}
      onCancel={cancel}
    />
  );
  return {
    settings,
    intercept,
    preferences,
    profile,
    transport,
    running,
    rankedReady:
      !!chosenId &&
      !running &&
      calibrationIsCurrent(profile, preferences.audioOffsetMs, preferences.audioOutputId)
  };
}
