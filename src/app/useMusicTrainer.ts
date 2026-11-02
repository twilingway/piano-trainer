import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { onPianoSoundInterrupted } from "../audio/pianoSound";
import type { MidiDevice } from "../input/midiInput";
import type { MusicCourseView } from "../ui/musicCourseTypes";
import type { Trainer } from "../practice/Trainer";
import { useAppSelector } from "./storeHooks";
import type { MusicCourseConnection } from "./musicCourseContracts";
import { readingDisplayProfile } from "./readingProfile";
import type { StaffPrefs } from "./staffPreferences";
import type { MusicCourseHook } from "./useMusicCourse";

export function useMusicTrainer(
  course: MusicCourseHook,
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
  const { active, policy, cancel, refreshConnection } = course;
  const statusRef = useRef(course.view.status);
  useLayoutEffect(() => {
    statusRef.current = course.view.status;
  }, [course.view.status]);
  const connectionRef = useRef<MusicCourseConnection | null>(null);
  useLayoutEffect(() => {
    const connection = { trainer: ready ? trainerRef.current : null, blocked, deviceId, timing };
    connectionRef.current = connection;
    refreshConnection({ ...connection, blocked: blocked || document.visibilityState === "hidden" });
  }, [refreshConnection, trainerRef, ready, blocked, deviceId, timing]);
  // Install before staff readiness: preparation frames and preheld ownership need the same policy.
  useLayoutEffect(() => {
    if (!active || !ready || !policy) return;
    const trainer = trainerRef.current;
    trainer?.configureCourse("music", policy);
    return () => {
      trainer?.configureCourse("music", null);
    };
  }, [active, ready, policy, trainerRef]);
  useEffect(() => {
    if (!active) return;
    const performing = () => ["playing", "listening", "reply"].includes(statusRef.current);
    const hidden = () => {
      const connection = connectionRef.current;
      if (!connection) return;
      const invisible = document.visibilityState === "hidden";
      if (invisible && performing()) cancel();
      refreshConnection({ ...connection, blocked: connection.blocked || invisible });
    };
    document.addEventListener("visibilitychange", hidden);
    const stop = onPianoSoundInterrupted(() => {
      if (performing()) cancel();
    });
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      stop();
    };
  }, [active, cancel, refreshConnection]);
}

/** Derive course-only visibility without writing over the player's saved staff preferences. */
export function usePracticeDisplayPrefs({
  practiceActive,
  ear,
  music,
  staffPrefs,
  performance,
  courseActive,
  courseView
}: {
  readonly practiceActive: boolean;
  readonly ear: boolean;
  readonly music: Pick<MusicCourseHook, "active" | "staffVisible" | "keysVisible"> & {
    readonly fingeringVisible?: boolean;
  };
  readonly staffPrefs: StaffPrefs;
  readonly performance: boolean;
  readonly courseActive: boolean;
  readonly courseView: "staff" | "tabs" | "both" | "hidden";
}): StaffPrefs {
  return useMemo(
    () =>
      practiceActive
        ? {
            ...readingDisplayProfile(staffPrefs),
            visible: music.active ? music.staffVisible : !ear,
            keys: music.active ? music.keysVisible : !ear,
            fingers: music.active && (music.fingeringVisible ?? false)
          }
        : performance
          ? {
              ...staffPrefs,
              visible: courseActive
                ? courseView === "staff" || courseView === "both"
                : staffPrefs.visible,
              fingers: false,
              hands: false,
              labels: false,
              noteNames: "off",
              chords: false
            }
          : courseActive
            ? { ...staffPrefs, visible: courseView === "staff" || courseView === "both" }
            : staffPrefs,
    [
      practiceActive,
      ear,
      music.active,
      music.staffVisible,
      music.keysVisible,
      music.fingeringVisible,
      staffPrefs,
      performance,
      courseActive,
      courseView
    ]
  );
}

/** canStart controls the manual action; an already running answer must keep its clock. */
export function musicClockAllowed(
  active: boolean,
  view: Pick<MusicCourseView, "status" | "canStart">
): boolean {
  return !active || view.canStart || view.status === "playing" || view.status === "reply";
}
