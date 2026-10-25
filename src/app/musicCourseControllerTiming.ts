import { getTimingProfile } from "./timingPreferences";
import type { MusicCourseConnection } from "./musicCourseContracts";
import type { MusicInputSource } from "../musicLearning/progress";

export function musicControllerInputOffset(
  source: MusicInputSource,
  connection: MusicCourseConnection
): number {
  const { timing } = connection;
  const device = source === "midi" ? (connection.deviceId ?? "") : source;
  const profile = getTimingProfile(
    timing,
    device,
    source === "midi" ? (timing.transports[device] ?? "usb") : "local"
  );
  return (profile?.inputOffsetMs ?? 0) + timing.manualOffsetMs;
}
