import { describe, expect, it } from "vitest";
import {
  GRACE_BP300,
  MAX_PIANO_INSTRUMENTS,
  MAX_PIANO_PROFILE_BYTES,
  parsePianoProfile,
  validatePianoProfile
} from "./instrumentProfiles";

const voice = (changes: Record<string, unknown> = {}) => ({
  name: "Pan Flute",
  program: 75,
  ...changes
});
const profile = (changes: Record<string, unknown> = {}) => ({
  version: 1,
  name: "My piano",
  instruments: [voice()],
  ...changes
});

describe("piano profile import", () => {
  it("accepts the documented optional version, trims labels and generates stable voice ids", () => {
    const parsed = parsePianoProfile(
      JSON.stringify({
        name: "  My piano  ",
        midiOutputName: " Piano MIDI Device ",
        instruments: [voice({ name: " Pan Flute ", group: " Winds ", panelNumber: 75 }), voice()]
      })
    );
    expect(parsed).toEqual({
      ok: true,
      profile: {
        name: "My piano",
        midiOutputName: "Piano MIDI Device",
        instruments: [
          { id: "instrument-0", name: "Pan Flute", group: "Winds", panelNumber: 75, program: 75 },
          { id: "instrument-1", name: "Pan Flute", program: 75 }
        ]
      }
    });
  });

  it("preserves unknown mappings and exact bank zero without inventing missing bank selectors", () => {
    const result = parsePianoProfile(
      JSON.stringify(
        profile({
          instruments: [
            voice({ program: null, panelNumber: 176 }),
            voice({ bankMSB: 0, bankLSB: 127 })
          ]
        })
      )
    );
    expect(result).toMatchObject({
      ok: true,
      profile: {
        instruments: [
          { id: "instrument-0", program: null, panelNumber: 176 },
          { id: "instrument-1", program: 75, bankMSB: 0, bankLSB: 127 }
        ]
      }
    });
    if (result.ok) expect(result.profile.instruments[0]).not.toHaveProperty("bankMSB");
  });

  it.each([
    [null, "invalid-profile"],
    [[], "invalid-profile"],
    [profile({ version: 2 }), "unsupported-version"],
    [profile({ version: "1" }), "unsupported-version"],
    [profile({ name: " " }), "invalid-name"],
    [profile({ name: "a".repeat(121) }), "invalid-name"],
    [profile({ midiOutputName: 5 }), "invalid-output-name"],
    [profile({ instruments: [] }), "invalid-instruments"],
    [profile({ instruments: [null] }), "invalid-instrument"],
    [profile({ instruments: [voice({ name: "" })] }), "invalid-instrument"],
    [profile({ instruments: [voice({ program: 128 })] }), "invalid-program"],
    [profile({ instruments: [voice({ program: -1 })] }), "invalid-program"],
    [profile({ instruments: [voice({ program: 2.5 })] }), "invalid-program"],
    [profile({ instruments: [{ name: "Missing program" }] }), "invalid-program"],
    [profile({ instruments: [voice({ bankMSB: 128 })] }), "invalid-bank"],
    [profile({ instruments: [voice({ bankLSB: -1 })] }), "invalid-bank"],
    [profile({ instruments: [voice({ program: null, bankMSB: 0 })] }), "invalid-bank"],
    [profile({ instruments: [voice({ panelNumber: -1 })] }), "invalid-instrument"],
    [profile({ instruments: [voice({ panelNumber: 1.5 })] }), "invalid-instrument"]
  ])("rejects malformed data atomically: %j", (value, code) => {
    const result = parsePianoProfile(JSON.stringify(value));
    expect(result).toMatchObject({ ok: false, error: { code } });
    expect(result).not.toHaveProperty("profile");
  });

  it("rejects duplicate explicit and generated ids but allows repeated instrument names", () => {
    expect(
      validatePianoProfile(
        profile({
          instruments: [voice({ id: "instrument-1" }), voice()]
        })
      )
    ).toMatchObject({ ok: false, error: { code: "duplicate-id", index: 1, field: "id" } });
    expect(
      validatePianoProfile(
        profile({
          instruments: [voice({ id: "first" }), voice({ id: "second" })]
        })
      ).ok
    ).toBe(true);
  });

  it("enforces the voice count at the boundary", () => {
    const instruments = Array.from({ length: MAX_PIANO_INSTRUMENTS }, () => voice());
    expect(validatePianoProfile(profile({ instruments })).ok).toBe(true);
    instruments.push(voice());
    expect(validatePianoProfile(profile({ instruments }))).toMatchObject({
      ok: false,
      error: { code: "invalid-instruments" }
    });
  });

  it("enforces byte limits including multibyte UTF-8 and distinguishes JSON syntax errors", () => {
    expect(parsePianoProfile(" ".repeat(MAX_PIANO_PROFILE_BYTES + 1))).toMatchObject({
      ok: false,
      error: { code: "too-large" }
    });
    expect(parsePianoProfile(JSON.stringify(profile({ name: "я".repeat(600000) })))).toMatchObject({
      ok: false,
      error: { code: "too-large" }
    });
    expect(parsePianoProfile("{")).toEqual({ ok: false, error: { code: "invalid-json" } });
  });

  it("returns new known-field objects rather than retaining caller data or unknown fields", () => {
    const original = profile({ ignored: "extra" });
    const result = validatePianoProfile(original);
    if (!result.ok) throw new Error("Expected valid fixture");
    original.instruments[0] = voice({ name: "Changed" });
    expect(result.profile.instruments[0]?.name).toBe("Pan Flute");
    expect(result.profile).not.toHaveProperty("ignored");
  });
});

describe("Grace BP-300 manual catalogue", () => {
  it("keeps all 238 distinct panel numbers, names and source anomalies", () => {
    expect(GRACE_BP300.instruments).toHaveLength(238);
    expect(GRACE_BP300.instruments.map((item) => item.panelNumber)).toEqual(
      Array.from({ length: 238 }, (_, index) => index)
    );
    expect(new Set(GRACE_BP300.instruments.map((item) => item.id)).size).toBe(238);
    expect(GRACE_BP300.instruments[75]).toMatchObject({ name: "Pan Flute", program: 75 });
    expect(GRACE_BP300.instruments[139]?.name).toBe("Marimba 2");
    expect(GRACE_BP300.instruments[140]?.name).toBe("Marimba 2");
    expect(GRACE_BP300.instruments[176]).toMatchObject({ name: "Pan Flute 2", program: null });
    expect(GRACE_BP300.instruments[237]?.name).toBe("Hu Ensemble");
    for (const item of GRACE_BP300.instruments) {
      expect(item.program).toBe((item.panelNumber ?? 128) < 128 ? item.panelNumber : null);
      expect(item).not.toHaveProperty("bankMSB");
      expect(item).not.toHaveProperty("bankLSB");
    }
  });
});
