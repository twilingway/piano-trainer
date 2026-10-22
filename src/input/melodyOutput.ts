export interface MelodyOutputSettings {
  readonly mode: "browser" | "midi" | "both";
  /** MIDI channel, 1–16. */
  readonly channel: number;
}

export const DEFAULT_MELODY_OUTPUT: MelodyOutputSettings = { mode: "browser", channel: 1 };

/** Accept saved settings without allowing invalid routes or MIDI channels. */
export function parseMelodyOutput(value: unknown): MelodyOutputSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_MELODY_OUTPUT;
  const saved = value as Record<string, unknown>;
  return {
    mode: saved.mode === "midi" || saved.mode === "both" ? saved.mode : "browser",
    channel:
      typeof saved.channel === "number" &&
      Number.isInteger(saved.channel) &&
      saved.channel >= 1 &&
      saved.channel <= 16
        ? saved.channel
        : DEFAULT_MELODY_OUTPUT.channel
  };
}
