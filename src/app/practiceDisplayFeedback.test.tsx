import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DEFAULT_STAFF_PREFS } from "./staffPreferences";
import { usePracticeDisplayPrefs } from "./useMusicTrainer";

type Input = Parameters<typeof usePracticeDisplayPrefs>[0];
const saved = Object.freeze({
  ...DEFAULT_STAFF_PREFS,
  flatNoteBurning: true,
  flatPressEffects: true,
  noteParticles: true
});
const base: Input = {
  practiceActive: true,
  ear: false,
  music: { active: false, staffVisible: false, keysVisible: false },
  staffPrefs: saved,
  performance: false,
  courseActive: false,
  courseView: "staff"
};
function display(input: Input) {
  let result: ReturnType<typeof usePracticeDisplayPrefs> | undefined;
  function Harness() {
    result = usePracticeDisplayPrefs(input);
    return null;
  }
  renderToStaticMarkup(<Harness />);
  if (!result) throw new Error("Missing display preferences");
  return result;
}

describe("practice-only staff feedback profile", () => {
  it.each([
    { name: "reading and joint-hand exercises", ear: false, music: base.music },
    { name: "ear exercise", ear: true, music: base.music },
    {
      name: "music with staff and keys",
      ear: false,
      music: { active: true, staffVisible: true, keysVisible: true }
    },
    {
      name: "music with hidden keys",
      ear: false,
      music: { active: true, staffVisible: true, keysVisible: false }
    }
  ])("suppresses game effects in $name without changing saved preferences", ({ ear, music }) => {
    const effective = display({ ...base, ear, music });
    expect(effective).toMatchObject({
      flatNoteBurning: false,
      flatPressEffects: false,
      noteParticles: false
    });
    expect(saved).toMatchObject({
      flatNoteBurning: true,
      flatPressEffects: true,
      noteParticles: true
    });
    expect(effective.keys).toBe(music.active ? music.keysVisible : !ear);
  });

  it("restores the same saved effects object on exercise exit", () => {
    expect(display({ ...base, practiceActive: false })).toBe(saved);
  });

  it("does not suppress effects in ordinary song or score-course modes", () => {
    for (const mode of [{ performance: true }, { courseActive: true }, {}]) {
      expect(display({ ...base, ...mode, practiceActive: false })).toMatchObject({
        flatNoteBurning: true,
        flatPressEffects: true,
        noteParticles: true
      });
    }
  });
});
