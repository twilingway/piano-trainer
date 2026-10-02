import {
  jitterQuality,
  median,
  type CalibrationResult,
  type ConnectionType
} from "../practice/calibration";

export interface TimingProfile extends CalibrationResult {
  deviceId: string;
  deviceName: string;
  transport: ConnectionType;
  audioOffsetMs: number;
  audioOutputId: string;
}
export interface TimingPreferences {
  version: 1;
  manualOffsetMs: number;
  audioOffsetMs: number;
  visualOffsetMs: number;
  audioOutputId: string;
  transports: Record<string, ConnectionType>;
  profiles: Record<string, TimingProfile>;
}
const STORAGE_KEY = "piano-trainer:timing-v1";
export function defaultTimingPreferences(): TimingPreferences {
  return {
    version: 1,
    manualOffsetMs: 0,
    audioOffsetMs: 0,
    visualOffsetMs: 0,
    audioOutputId: "default",
    transports: {},
    profiles: {}
  };
}
export function profileKey(deviceId: string, transport: ConnectionType): string {
  return JSON.stringify([deviceId, transport]);
}
export function getTimingProfile(
  preferences: TimingPreferences,
  deviceId: string,
  transport: ConnectionType
): TimingProfile | undefined {
  return preferences.profiles[profileKey(deviceId, transport)];
}
export function updateTimingProfile(
  preferences: TimingPreferences,
  profile: TimingProfile
): TimingPreferences {
  return {
    ...preferences,
    profiles: {
      ...preferences.profiles,
      [profileKey(profile.deviceId, profile.transport)]: profile
    }
  };
}
export function calibrationIsCurrent(
  profile: TimingProfile | undefined,
  audioOffsetMs: number,
  audioOutputId: string
): boolean {
  return (
    !!profile?.complete &&
    profile.confidence !== "low" &&
    profile.audioOffsetMs === audioOffsetMs &&
    profile.audioOutputId === audioOutputId
  );
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function offset(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(-1000, Math.min(1000, value))
    : 0;
}
function connection(value: unknown): value is ConnectionType {
  return value === "usb" || value === "ble" || value === "local";
}
function validProfile(value: unknown): value is TimingProfile {
  if (!isRecord(value)) return false;
  const valid =
    typeof value.deviceId === "string" &&
    typeof value.deviceName === "string" &&
    connection(value.transport) &&
    typeof value.audioOutputId === "string" &&
    typeof value.audioOffsetMs === "number" &&
    Number.isFinite(value.audioOffsetMs) &&
    Math.abs(value.audioOffsetMs) <= 1000 &&
    typeof value.inputOffsetMs === "number" &&
    Number.isFinite(value.inputOffsetMs) &&
    Math.abs(value.inputOffsetMs) <= 1000 &&
    typeof value.jitterMs === "number" &&
    Number.isFinite(value.jitterMs) &&
    value.jitterMs >= 0 &&
    ["excellent", "good", "acceptable", "unstable"].includes(String(value.quality)) &&
    ["high", "medium", "low"].includes(String(value.confidence)) &&
    typeof value.complete === "boolean" &&
    typeof value.rejectedSamples === "number" &&
    Number.isInteger(value.rejectedSamples) &&
    value.rejectedSamples >= 0 &&
    value.rejectedSamples <= 24 &&
    Array.isArray(value.calibrationSamples) &&
    value.calibrationSamples.length <= 24 &&
    value.calibrationSamples.every(
      (sample: unknown) => typeof sample === "number" && Number.isFinite(sample)
    );
  if (!valid || !Array.isArray(value.calibrationSamples)) return false;
  const samples = value.calibrationSamples as number[];
  if (
    value.complete &&
    (samples.length < 18 || samples.length + Number(value.rejectedSamples) < 24)
  )
    return false;
  const center = median(samples);
  const jitter = median(samples.map((sample) => Math.abs(sample - center)));
  return (
    value.inputOffsetMs === center &&
    value.jitterMs === jitter &&
    value.quality === jitterQuality(jitter) &&
    (value.confidence === "low" || (value.complete === true && jitter <= 15))
  );
}
export function loadTimingPreferences(storage?: Pick<Storage, "getItem">): TimingPreferences {
  const fallback = defaultTimingPreferences();
  try {
    const raw: unknown = JSON.parse((storage ?? localStorage).getItem(STORAGE_KEY) ?? "null");
    if (!isRecord(raw) || raw.version !== 1) return fallback;
    const profiles: Record<string, TimingProfile> = {};
    if (isRecord(raw.profiles))
      for (const value of Object.values(raw.profiles)) {
        if (validProfile(value)) profiles[profileKey(value.deviceId, value.transport)] = value;
      }
    const transports: Record<string, ConnectionType> = {};
    if (isRecord(raw.transports))
      for (const [id, value] of Object.entries(raw.transports)) {
        if (connection(value))
          Object.defineProperty(transports, id, {
            value,
            enumerable: true,
            writable: true,
            configurable: true
          });
      }
    return {
      version: 1,
      manualOffsetMs: offset(raw.manualOffsetMs),
      audioOffsetMs: offset(raw.audioOffsetMs),
      visualOffsetMs: offset(raw.visualOffsetMs),
      audioOutputId: typeof raw.audioOutputId === "string" ? raw.audioOutputId : "default",
      profiles,
      transports
    };
  } catch {
    return fallback;
  }
}
export function saveTimingPreferences(
  preferences: TimingPreferences,
  storage?: Pick<Storage, "setItem">
): void {
  try {
    (storage ?? localStorage).setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    /* Storage may be unavailable. */
  }
}
