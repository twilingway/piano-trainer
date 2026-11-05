// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { findSongCourseSource } from "./catalog";
import { buildSongCourseMaterial } from "./material";
import { courseCharacterPresentation, courseTeacherPose } from "./characterPresentation";
import type { CourseMaterial } from "./model";

function must<T>(value: T | null | undefined): T {
  if (value === undefined || value === null) throw new Error("missing test fixture");
  return value;
}

function fixture(): CourseMaterial {
  const source = must(findSongCourseSource("hot-cross-buns"));
  const node = must(source.nodes.find((value) => value.kind === "performance"));
  const material = buildSongCourseMaterial(source, node.id);
  return { ...material, node: { ...material.node, kind: "guided-phrase" } };
}
function noteOf(material: CourseMaterial, pitch: number) {
  return must(material.expected.find((note) => note.pitch === pitch));
}
function transformNote(
  material: CourseMaterial,
  values: { pitch?: number; finger?: 1 | 2 | 3 | 4 | 5; hand?: "left" | "right"; part?: string }
) {
  const expected = noteOf(material, 60);
  return {
    ...material,
    expected: material.expected.map((note) =>
      note === expected
        ? { ...note, ...(values.pitch !== undefined ? { pitch: values.pitch } : {}) }
        : note
    ),
    song: {
      ...material.song,
      notes: material.song.notes.map((note) =>
        note.id === expected.runtimeNoteId ? { ...note, ...values } : note
      )
    }
  };
}
describe("verified course character presentation", () => {
  it.each([
    [60, "do"],
    [62, "re"],
    [64, "mi"]
  ] as const)("maps exact RH %i with its source finger to %s", (pitch, pose) => {
    const material = fixture();
    expect(courseTeacherPose(material, noteOf(material, pitch).sourceNoteId)).toBe(pose);
  });
  it.each([
    { pitch: 72, finger: 1 as const },
    { pitch: 65, finger: 4 as const },
    { finger: 2 as const },
    { hand: "left" as const },
    { part: "accompaniment" }
  ])("does not invent a contact for %j", (values) => {
    const material = fixture();
    expect(
      courseTeacherPose(transformNote(material, values), noteOf(material, 60).sourceNoteId)
    ).toBe("idle");
  });
  it("requires consistent runtime pitch and explicit learner identity", () => {
    const material = fixture();
    const note = noteOf(material, 60);
    const changed = {
      ...material,
      expected: material.expected.map((item) => (item === note ? { ...item, pitch: 62 } : item))
    };
    expect(courseTeacherPose(changed, note.sourceNoteId)).toBe("idle");
    expect(
      courseTeacherPose(
        material,
        must(
          material.song.notes.find(
            (item) => !material.source.learnerPartIds.includes(item.part ?? "")
          )
        ).id
      )
    ).toBe("idle");
    expect(courseTeacherPose(material, null)).toBe("idle");
  });
  it("uses the supplied demo time with half-open sounding intervals", () => {
    const material = fixture();
    const note = noteOf(material, 60);
    const single = { ...material, expected: [note] };
    const read = (time: number) =>
      courseCharacterPresentation({
        material: single,
        phase: "demo",
        visible: true,
        playing: true,
        songTime: time,
        targetSourceNoteId: note.sourceNoteId,
        heldSourceNoteId: null,
        expression: "neutral"
      });
    expect(read(note.start - 0.0001).teacherPose).toBe("idle");
    expect(read(note.start).teacherPose).toBe("do");
    expect(read(note.start + note.duration - 0.0001).teacherPose).toBe("do");
    expect(read(note.start + note.duration).teacherPose).toBe("idle");
  });
  it("does not illustrate simultaneous demo notes as one finger", () => {
    const material = fixture();
    const note = noteOf(material, 60);
    const overlap = {
      ...material,
      expected: [note, { ...noteOf(material, 62), start: note.start }]
    };
    expect(
      courseCharacterPresentation({
        material: overlap,
        phase: "demo",
        visible: true,
        playing: true,
        songTime: note.start,
        targetSourceNoteId: note.sourceNoteId,
        heldSourceNoteId: null,
        expression: "neutral"
      }).teacherPose
    ).toBe("idle");
  });
  it.each(["ready", "paused", "awaiting-keys-up", "awaiting-rehold", "error", "result"])(
    "returns an idle teacher in %s",
    (phase) => {
      const material = fixture();
      const note = noteOf(material, 60);
      expect(
        courseCharacterPresentation({
          material,
          phase,
          visible: true,
          playing: true,
          songTime: note.start,
          targetSourceNoteId: note.sourceNoteId,
          heldSourceNoteId: note.sourceNoteId,
          expression: "neutral"
        }).teacherPose
      ).toBe("idle");
    }
  );
  it.each(["independent-phrase", "performance"] as const)(
    "does not reveal the pitch during %s",
    (kind) => {
      const material = fixture();
      const note = noteOf(material, 60);
      const result = courseCharacterPresentation({
        material: { ...material, node: { ...material.node, kind } },
        phase: "playing",
        visible: true,
        playing: true,
        songTime: 0,
        targetSourceNoteId: note.sourceNoteId,
        heldSourceNoteId: note.sourceNoteId,
        expression: "correct"
      });
      expect(result.companion).toBeNull();
      expect(result.teacherPose).toBe("idle");
      expect(result.expression).toBe("neutral");
    }
  );
  it("does not expose a companion or contact when hidden or without material", () => {
    const material = fixture();
    const note = noteOf(material, 60);
    const state = {
      material,
      phase: "playing",
      visible: false,
      playing: true,
      songTime: 0,
      targetSourceNoteId: note.sourceNoteId,
      heldSourceNoteId: note.sourceNoteId,
      expression: "correct" as const
    };
    expect(courseCharacterPresentation(state)).toMatchObject({
      companion: null,
      teacherPose: "idle",
      expression: "neutral"
    });
    expect(courseCharacterPresentation({ ...state, material: null })).toMatchObject({
      companion: null,
      teacherPose: "idle"
    });
  });
});
