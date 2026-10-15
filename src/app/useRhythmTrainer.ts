import { useEffect, useLayoutEffect, type RefObject } from "react";
import { onPianoSoundInterrupted } from "../audio/pianoSound";
import type { Trainer } from "../practice/Trainer";
import type { MidiDevice } from "../input/midiInput";
import type { RhythmCourseController } from "./useRhythmCourse";
import { isTypingTarget } from "../input/computerKeyboard";
import { useAppSelector } from "./storeHooks";

export function useRhythmTrainer(
  course: RhythmCourseController,
  trainerRef: RefObject<Trainer | null>,
  trainerReady: boolean,
  blocked: boolean,
  devices: readonly MidiDevice[],
  selectedDeviceId: string
) {
  const timing = useAppSelector((state) => state.preferences.timing);
  const deviceId =
    devices.find((device) => device.id === selectedDeviceId)?.id ??
    (selectedDeviceId === "all" && devices.length === 1 ? devices[0]?.id : undefined);
  const { active, policy, cancel, connectionRef, refreshConnection, onTapDown, onTapUp } = course;
  useLayoutEffect(() => {
    cancel();
    connectionRef.current = { trainer: trainerRef.current, blocked, deviceId, timing };
    refreshConnection(connectionRef.current);
  }, [
    trainerRef,
    trainerReady,
    blocked,
    deviceId,
    timing,
    cancel,
    connectionRef,
    refreshConnection
  ]);
  useLayoutEffect(() => {
    const trainer = trainerRef.current;
    trainer?.configureCourse("rhythm", policy);
    return () => {
      cancel();
      trainer?.configureCourse("rhythm", null);
    };
  }, [trainerRef, trainerReady, policy, cancel]);
  useEffect(() => {
    if (!active) return;
    const visibility = () => {
      if (document.visibilityState === "hidden") cancel();
    };
    document.addEventListener("visibilitychange", visibility);
    const stop = onPianoSoundInterrupted(cancel);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      stop();
    };
  }, [active, cancel]);
  useEffect(() => {
    if (!active) return;
    const down = (event: KeyboardEvent) => {
      if (
        blocked ||
        event.code !== "Space" ||
        event.defaultPrevented ||
        isTypingTarget(event.target) ||
        (event.target instanceof Element && event.target.closest("button, [role='button']"))
      )
        return;
      event.preventDefault();
      if (!event.repeat && !event.ctrlKey && !event.altKey && !event.metaKey)
        onTapDown("keyboard", event.timeStamp, "key:Space");
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === "Space") onTapUp("keyboard", "key:Space");
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      onTapUp("keyboard", "key:Space");
    };
  }, [active, blocked, onTapDown, onTapUp]);
}
