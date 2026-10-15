import { useEffect, useLayoutEffect, type RefObject } from "react";
import { onPianoSoundInterrupted } from "../audio/pianoSound";
import type { MidiDevice } from "../input/midiInput";
import type { Trainer } from "../practice/Trainer";
import { useAppSelector } from "./storeHooks";
import type { IndependentRhythmCourseController } from "./useIndependentRhythmCourse";

export function useIndependentRhythmTrainer(
  course: IndependentRhythmCourseController,
  trainerRef: RefObject<Trainer | null>,
  ready: boolean,
  blocked: boolean,
  devices: readonly MidiDevice[],
  selectedDeviceId: string
) {
  const timing = useAppSelector((state) => state.preferences.timing);
  const deviceId =
    devices.find((device) => device.id === selectedDeviceId)?.id ??
    (selectedDeviceId === "all" && devices.length === 1 ? devices[0]?.id : undefined);
  const { active, policy, cancel, refreshConnection, ready: presented } = course;
  useLayoutEffect(() => {
    refreshConnection({ trainer: ready ? trainerRef.current : null, blocked, deviceId, timing });
  }, [refreshConnection, trainerRef, ready, blocked, deviceId, timing]);
  useLayoutEffect(() => {
    if (!ready || !presented || !policy) return;
    const trainer = trainerRef.current;
    trainer?.configureCourse("independentRhythm", policy);
    return () => {
      trainer?.configureCourse("independentRhythm", null);
    };
  }, [policy, presented, trainerRef, ready]);
  useEffect(() => {
    if (!active) return;
    const hidden = () => {
      if (document.visibilityState === "hidden") cancel();
    };
    document.addEventListener("visibilitychange", hidden);
    const stop = onPianoSoundInterrupted(cancel);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      stop();
    };
  }, [active, cancel]);
}
