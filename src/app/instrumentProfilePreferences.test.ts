import { describe, expect, it } from "vitest";
import {
  GRACE_BP300,
  MAX_CUSTOM_PIANO_PROFILES,
  type PianoProfile
} from "../input/instrumentProfiles";
import {
  activePianoProfile,
  allPianoProfiles,
  DEFAULT_INSTRUMENT_PROFILE_PREFERENCES,
  normalizeInstrumentProfilePreferences,
  selectedPianoInstrument
} from "./instrumentProfilePreferences";

const custom: PianoProfile = {
  id: "my-piano",
  name: "Stage Piano",
  midiOutputName: "Stage MIDI",
  instruments: [{ id: "voice", name: "Custom voice", program: 3, bankMSB: 1 }]
};

describe("piano profile preferences", () => {
  it("defaults to Grace and leaves the current hardware sound unchanged", () => {
    const prefs = normalizeInstrumentProfilePreferences(null);
    expect(prefs).toEqual(DEFAULT_INSTRUMENT_PROFILE_PREFERENCES);
    expect(activePianoProfile(prefs)).toBe(GRACE_BP300);
    expect(selectedPianoInstrument(prefs)).toBeUndefined();
  });

  it("hydrates custom profiles and selected instruments with their exact MIDI mapping", () => {
    const prefs = normalizeInstrumentProfilePreferences({
      customProfiles: [custom],
      profileId: custom.id,
      instrumentId: "voice"
    });
    expect(activePianoProfile(prefs)).toEqual(custom);
    expect(selectedPianoInstrument(prefs)).toEqual(custom.instruments[0]);
    expect(allPianoProfiles(prefs)).toHaveLength(2);
  });

  it("renames the built-in profile without mutating its name or catalogue", () => {
    const prefs = normalizeInstrumentProfilePreferences({
      graceName: " My Grace ",
      profileId: GRACE_BP300.id,
      instrumentId: "voice-075"
    });
    expect(activePianoProfile(prefs)?.name).toBe("My Grace");
    expect(allPianoProfiles(prefs)[0]?.name).toBe("My Grace");
    expect(selectedPianoInstrument(prefs)?.program).toBe(75);
    expect(GRACE_BP300.name).toBe("Grace BP-300");
  });

  it("drops stale profile and voice references rather than choosing a similarly named voice", () => {
    const staleProfile = normalizeInstrumentProfilePreferences({
      profileId: "removed",
      instrumentId: "voice-075",
      customProfiles: [custom]
    });
    expect(staleProfile.profileId).toBe(GRACE_BP300.id);
    expect(staleProfile.instrumentId).toBeNull();
    const staleVoice = normalizeInstrumentProfilePreferences({
      profileId: custom.id,
      instrumentId: "removed",
      customProfiles: [custom]
    });
    expect(staleVoice.profileId).toBe(custom.id);
    expect(staleVoice.instrumentId).toBeNull();
  });

  it("preserves an explicit unselected piano and clears its old voice mapping", () => {
    const prefs = normalizeInstrumentProfilePreferences({
      profileId: null,
      instrumentId: "voice-075",
      customProfiles: [custom],
      graceName: "My Grace"
    });
    expect(prefs.profileId).toBeNull();
    expect(prefs.instrumentId).toBeNull();
    expect(prefs.customProfiles).toEqual([custom]);
    expect(activePianoProfile(prefs)).toBeUndefined();
    expect(selectedPianoInstrument(prefs)).toBeUndefined();
    expect(allPianoProfiles(prefs)).toHaveLength(2);
  });

  it("rejects malformed and duplicate stored profiles and cannot replace built-in Grace", () => {
    const prefs = normalizeInstrumentProfilePreferences({
      customProfiles: [
        { ...custom, id: GRACE_BP300.id },
        custom,
        custom,
        { ...custom, id: "broken", instruments: [{ id: "x", name: "X", program: 400 }] }
      ],
      graceName: " ",
      profileId: "broken",
      instrumentId: "x"
    });
    expect(prefs.customProfiles).toEqual([custom]);
    expect(prefs.profileId).toBe(GRACE_BP300.id);
    expect(prefs).not.toHaveProperty("graceName");
  });

  it("caps restored custom profiles and keeps independent instrument ids in different profiles", () => {
    const profiles = Array.from({ length: MAX_CUSTOM_PIANO_PROFILES + 1 }, (_, index) => ({
      ...custom,
      id: `profile-${String(index)}`
    }));
    const prefs = normalizeInstrumentProfilePreferences({
      customProfiles: profiles,
      profileId: `profile-${String(MAX_CUSTOM_PIANO_PROFILES)}`,
      instrumentId: "voice"
    });
    expect(prefs.customProfiles).toHaveLength(MAX_CUSTOM_PIANO_PROFILES);
    expect(prefs.profileId).toBe(GRACE_BP300.id);
    expect(prefs.instrumentId).toBeNull();
  });
});
