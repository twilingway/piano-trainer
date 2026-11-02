import {
  GRACE_BP300,
  MAX_CUSTOM_PIANO_PROFILES,
  pianoProfileName,
  validatePianoProfile,
  type PianoProfile,
  type PianoInstrument
} from "../input/instrumentProfiles";

export interface InstrumentProfilePreferences {
  readonly customProfiles: readonly PianoProfile[];
  readonly profileId: string | null;
  readonly instrumentId: string | null;
  readonly graceName?: string;
}

export const DEFAULT_INSTRUMENT_PROFILE_PREFERENCES: InstrumentProfilePreferences = {
  customProfiles: [],
  profileId: GRACE_BP300.id,
  instrumentId: null
};

export function allPianoProfiles(prefs: InstrumentProfilePreferences): readonly PianoProfile[] {
  const grace = prefs.graceName ? { ...GRACE_BP300, name: prefs.graceName } : GRACE_BP300;
  return [grace, ...prefs.customProfiles];
}

export function activePianoProfile(prefs: InstrumentProfilePreferences): PianoProfile | undefined {
  if (prefs.profileId === null) return undefined;
  return allPianoProfiles(prefs).find((profile) => profile.id === prefs.profileId) ?? GRACE_BP300;
}

export function selectedPianoInstrument(
  prefs: InstrumentProfilePreferences
): PianoInstrument | undefined {
  return activePianoProfile(prefs)?.instruments.find((voice) => voice.id === prefs.instrumentId);
}

export function normalizeInstrumentProfilePreferences(raw: unknown): InstrumentProfilePreferences {
  const value =
    raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const customProfiles: PianoProfile[] = [];
  const ids = new Set([GRACE_BP300.id]);
  if (Array.isArray(value.customProfiles)) {
    for (const record of value.customProfiles.slice(0, MAX_CUSTOM_PIANO_PROFILES)) {
      if (!record || typeof record !== "object" || Array.isArray(record)) continue;
      const id = pianoProfileName((record as Record<string, unknown>).id);
      if (!id || ids.has(id)) continue;
      const result = validatePianoProfile(record);
      if (!result.ok) continue;
      ids.add(id);
      customProfiles.push({ id, ...result.profile });
    }
  }
  const graceName = pianoProfileName(value.graceName);
  const profileId =
    value.profileId === null
      ? null
      : typeof value.profileId === "string" && ids.has(value.profileId)
        ? value.profileId
        : GRACE_BP300.id;
  const preferences: InstrumentProfilePreferences = {
    customProfiles,
    profileId,
    instrumentId: null,
    ...(graceName ? { graceName } : {})
  };
  const selected = activePianoProfile(preferences)?.instruments.find(
    (voice) => voice.id === value.instrumentId
  );
  return {
    ...preferences,
    instrumentId: profileId === value.profileId && selected ? selected.id : null
  };
}
