import graceVoices from "./graceBp300.json";

export interface PianoInstrument {
  readonly id: string;
  readonly name: string;
  readonly group?: string;
  readonly panelNumber?: number;
  readonly program: number | null;
  readonly bankMSB?: number;
  readonly bankLSB?: number;
}

export interface PianoProfile {
  readonly id: string;
  readonly name: string;
  readonly midiOutputName?: string;
  readonly instruments: readonly PianoInstrument[];
}

export const MAX_PIANO_PROFILE_BYTES = 1024 * 1024;
export const MAX_PIANO_INSTRUMENTS = 512;
export const MAX_CUSTOM_PIANO_PROFILES = 64;
export const MAX_PIANO_NAME_LENGTH = 120;

export interface PianoProfileImportError {
  readonly code:
    | "too-large"
    | "invalid-json"
    | "invalid-profile"
    | "unsupported-version"
    | "invalid-name"
    | "invalid-output-name"
    | "invalid-instruments"
    | "invalid-instrument"
    | "invalid-program"
    | "invalid-bank"
    | "duplicate-id";
  readonly index?: number;
  readonly field?: string;
}

export type PianoProfileImportResult =
  | { readonly ok: true; readonly profile: Omit<PianoProfile, "id"> }
  | { readonly ok: false; readonly error: PianoProfileImportError };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const byte = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 127;

export function pianoProfileName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const name = value.trim();
  return name.length > 0 && name.length <= MAX_PIANO_NAME_LENGTH ? name : undefined;
}

const failure = (
  code: PianoProfileImportError["code"],
  index?: number,
  field?: string
): PianoProfileImportResult => ({
  ok: false,
  error: { code, ...(index === undefined ? {} : { index }), ...(field ? { field } : {}) }
});

/** Validates decoded import data without retaining any caller-owned objects. */
export function validatePianoProfile(value: unknown): PianoProfileImportResult {
  if (!isRecord(value)) return failure("invalid-profile");
  if (value.version !== undefined && value.version !== 1) return failure("unsupported-version");
  const name = pianoProfileName(value.name);
  if (!name) return failure("invalid-name");
  const midiOutputName = pianoProfileName(value.midiOutputName);
  if (value.midiOutputName !== undefined && !midiOutputName) return failure("invalid-output-name");
  if (
    !Array.isArray(value.instruments) ||
    value.instruments.length === 0 ||
    value.instruments.length > MAX_PIANO_INSTRUMENTS
  )
    return failure("invalid-instruments");
  const instruments: PianoInstrument[] = [];
  const ids = new Set<string>();
  for (const [index, raw] of value.instruments.entries()) {
    if (!isRecord(raw)) return failure("invalid-instrument", index);
    const instrumentName = pianoProfileName(raw.name);
    const id = raw.id === undefined ? `instrument-${String(index)}` : pianoProfileName(raw.id);
    if (!instrumentName || !id) return failure("invalid-instrument", index, !id ? "id" : "name");
    if (ids.has(id)) return failure("duplicate-id", index, "id");
    ids.add(id);
    const group = pianoProfileName(raw.group);
    if (raw.group !== undefined && !group) return failure("invalid-instrument", index, "group");
    if (
      raw.panelNumber !== undefined &&
      (typeof raw.panelNumber !== "number" ||
        !Number.isSafeInteger(raw.panelNumber) ||
        raw.panelNumber < 0)
    )
      return failure("invalid-instrument", index, "panelNumber");
    if (raw.program !== null && !byte(raw.program))
      return failure("invalid-program", index, "program");
    for (const field of ["bankMSB", "bankLSB"] as const)
      if (raw[field] !== undefined && (raw.program === null || !byte(raw[field])))
        return failure("invalid-bank", index, field);
    instruments.push({
      id,
      name: instrumentName,
      program: raw.program,
      ...(group === undefined ? {} : { group }),
      ...(typeof raw.panelNumber === "number" ? { panelNumber: raw.panelNumber } : {}),
      ...(byte(raw.bankMSB) ? { bankMSB: raw.bankMSB } : {}),
      ...(byte(raw.bankLSB) ? { bankLSB: raw.bankLSB } : {})
    });
  }
  return {
    ok: true,
    profile: { name, instruments, ...(midiOutputName ? { midiOutputName } : {}) }
  };
}

export function parsePianoProfile(text: string): PianoProfileImportResult {
  if (
    text.length > MAX_PIANO_PROFILE_BYTES ||
    new TextEncoder().encode(text).byteLength > MAX_PIANO_PROFILE_BYTES
  )
    return failure("too-large");
  try {
    return validatePianoProfile(JSON.parse(text) as unknown);
  } catch {
    return failure("invalid-json");
  }
}

/** Manual names with bank/program mappings captured from the owner's BP-300 over USB MIDI. */
export const GRACE_BP300: PianoProfile = {
  id: "grace-bp-300",
  name: "Grace BP-300",
  midiOutputName: "Piano MIDI Device",
  instruments: graceVoices.map((voice) => ({
    ...voice,
    id: `voice-${String(voice.panelNumber).padStart(3, "0")}`
  }))
};
