// @vitest-environment happy-dom
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  SONG_COURSE_SOURCES,
  SONG_COURSE_SOURCE_KEYS,
  findSongCourseNode,
  findSongCourseSource
} from "./catalog";
import manifest from "./scores/manifest.json";
import { loadSongCourseSource } from "./loader";
import { buildSongCourseMaterial, courseDisplayRange } from "./material";

const shapes = [
  { id: "hot-cross-buns", pitches: [60, 62, 64], measures: 8, tempo: 72 },
  { id: "aunt-rhody", pitches: [60, 62, 64, 65], measures: 8, tempo: 72 },
  { id: "lightly-row", pitches: [60, 62, 64, 65, 67], measures: 16, tempo: 72 },
  { id: "ode-to-joy", pitches: [60, 62, 64, 65, 67], measures: 16, tempo: 76 },
  { id: "twinkle", pitches: [60, 62, 64, 65, 67, 69], measures: 12, tempo: 80 },
  { id: "joy-octave", pitches: [60, 62, 64, 65, 67, 69, 71, 72], measures: 4, tempo: 72 }
];

describe("melody-led course content", () => {
  it("publishes six real scores with the intended gradual ranges and authored bar lengths", () => {
    expect(SONG_COURSE_SOURCES).toHaveLength(6);
    for (const shape of shapes) {
      const source = findSongCourseSource(shape.id);
      if (!source) throw new Error(shape.id);
      const { song } = loadSongCourseSource(source);
      const notes = song.notes.filter((note) => source.learnerPartIds.includes(note.part ?? ""));
      expect([...new Set(notes.map((note) => note.pitch))].sort((a, b) => a - b)).toEqual(
        shape.pitches
      );
      expect(song.measures).toHaveLength(shape.measures);
      expect(song.measures.every((measure) => measure.length === 4)).toBe(true);
      expect(song.duration).toBeCloseTo((shape.measures * 4 * 60) / shape.tempo);
      expect(
        notes.every((note) => note.scoreFinger !== undefined && note.finger === note.scoreFinger)
      ).toBe(true);
      expect(song.notes.some((note) => source.accompanimentPartIds.includes(note.part ?? ""))).toBe(
        true
      );
      const provenance = manifest[shape.id as keyof typeof manifest];
      expect(createHash("sha256").update(source.musicXml).digest("hex")).toBe(provenance.sha256);
      expect(source.sourceHash).toBe(provenance.sha256);
    }
  });

  it("uses actual MusicXML for every path node and the finale retains the complete source melody", () => {
    const nodeIds: string[] = [];
    for (const source of SONG_COURSE_SOURCES) {
      const full = loadSongCourseSource(source);
      for (const node of source.nodes) {
        nodeIds.push(node.id);
        const material = buildSongCourseMaterial(source, node.id);
        expect(material.expected.length).toBeGreaterThan(0);
        expect(new Set(material.expected.map((note) => note.sourceNoteId)).size).toBe(
          material.expected.length
        );
        expect(
          material.expected.every(
            (note) => material.sourceToRuntime.get(note.sourceNoteId) === note.runtimeNoteId
          )
        ).toBe(true);
        expect(courseDisplayRange(material)).toEqual({ low: 60, high: 72 });
      }
      const finale = source.nodes.at(-1);
      if (!finale) throw new Error("missing finale");
      expect(finale.kind).toBe("performance");
      const material = buildSongCourseMaterial(source, finale);
      expect(material.expected.map((note) => note.pitch)).toEqual(
        full.song.notes.filter((note) => note.part === "learner").map((note) => note.pitch)
      );
      expect(material.song.duration).toBeCloseTo(full.song.duration);
    }
    expect(new Set(nodeIds).size).toBe(nodeIds.length);
  });

  it("introduces C, D and E before the unchanged mixed phrase and written durations", () => {
    const source = findSongCourseSource("hot-cross-buns");
    if (!source) throw new Error("missing source");
    expect(source.nodes.slice(0, 7).map((node) => node.kind)).toEqual([
      "notes",
      "notes",
      "notes",
      "notes",
      "duration",
      "duration",
      "duration"
    ]);
    const materials = source.nodes.slice(0, 7).map((node) => buildSongCourseMaterial(source, node));
    expect(materials[0]?.expected.map((note) => note.pitch)).toEqual([60, 60, 60, 60]);
    expect(materials[1]?.expected.map((note) => note.pitch)).toEqual([62, 62, 62, 62]);
    expect(materials[2]?.expected.map((note) => note.pitch)).toEqual([64, 64, 64, 64]);
    expect(materials[3]?.expected.map((note) => note.pitch)).toEqual([64, 62, 60]);
    for (const material of materials.slice(0, 3)) {
      expect(material.expected.map((note) => note.startBeat)).toEqual([0, 1, 2, 3]);
      expect(material.expected.every((note) => Math.abs(note.duration - 60 / 72) < 1e-7)).toBe(
        true
      );
    }
    expect(
      materials[4]?.expected.map((note) => Number(((note.duration * 72) / 60).toFixed(6)))
    ).toEqual([1, 1, 1, 1]);
    expect(
      materials[5]?.expected.map((note) => Number(((note.duration * 72) / 60).toFixed(6)))
    ).toEqual([2, 2]);
    expect(
      materials[6]?.expected.map((note) => Number(((note.duration * 72) / 60).toFixed(6)))
    ).toEqual([4]);
    expect(materials[6]?.musicXml).toContain("<type>whole</type>");
  });

  it("retains the legacy one-E material and the old mixed node behind the new four-E step", () => {
    const source = findSongCourseSource("hot-cross-buns");
    if (!source) throw new Error("missing source");
    expect(source.nodes.slice(0, 4).map((node) => node.id)).toEqual([
      "hot-cross-buns/notes-c",
      "hot-cross-buns/notes-d",
      "hot-cross-buns/notes-e-quarter-v1",
      "hot-cross-buns/notes-e"
    ]);
    const intro = findSongCourseNode(source.id, "hot-cross-buns/notes-e-intro");
    const mixed = findSongCourseNode(source.id, "hot-cross-buns/notes-e");
    if (!intro || !mixed) throw new Error("missing introduction or mixed phrase");
    expect(intro.sourceNoteIds).toEqual(["hot-cross-buns-m1-n1"]);
    const material = buildSongCourseMaterial(source, intro);
    expect(material.expected).toHaveLength(1);
    const expected = material.expected[0];
    if (!expected) throw new Error("missing expected E");
    expect(expected.sourceNoteId).toBe("hot-cross-buns@1:hot-cross-buns-m1-n1");
    expect(expected.pitch).toBe(64);
    expect(expected.start).toBe(0);
    expect(expected.duration).toBeCloseTo((2 * 60) / 72);
    const written = material.song.notes.find((note) => note.id === expected.runtimeNoteId);
    expect(written?.scoreFinger).toBe(3);
    expect(written?.finger).toBe(3);
    const document = new DOMParser().parseFromString(material.musicXml, "application/xml");
    expect(
      document.getElementById("hot-cross-buns-m1-n1")?.querySelector("type")?.textContent
    ).toBe("half");
    expect(
      document.getElementById("hot-cross-buns-m1-n1")?.querySelector("fingering")?.textContent
    ).toBe("3");
    expect(mixed.sourceNoteIds).toEqual([
      "hot-cross-buns-m1-n1",
      "hot-cross-buns-m1-n2",
      "hot-cross-buns-m2-n1"
    ]);
    expect(mixed.title).toBe("Собираем до, ре и ми");
    expect(buildSongCourseMaterial(source, mixed).expected.map((note) => note.pitch)).toEqual([
      64, 62, 60
    ]);
    expect(source.revision).toBe("1");
    expect(source.sourceHash).toBe(manifest["hot-cross-buns"].sha256);
  });

  it("teaches the sixth note through a prepared change of fingers and the octave through a turn", () => {
    const twinkle = findSongCourseSource("twinkle");
    const joy = findSongCourseSource("joy-octave");
    if (!twinkle || !joy) throw new Error("missing source");
    const stars = loadSongCourseSource(twinkle).song.notes.filter(
      (note) => note.part === "learner"
    );
    expect(stars.slice(0, 7).map((note) => [note.pitch, note.scoreFinger])).toEqual([
      [60, 1],
      [60, 1],
      [67, 5],
      [67, 4],
      [69, 5],
      [69, 5],
      [67, 4]
    ]);
    const octave = loadSongCourseSource(joy).song.notes.filter((note) => note.part === "learner");
    expect(octave.map((note) => [note.pitch, note.scoreFinger])).toEqual([
      [72, 5],
      [71, 4],
      [69, 3],
      [67, 2],
      [65, 1],
      [64, 3],
      [62, 2],
      [60, 1]
    ]);
    expect(joy.title).toContain("мотив");
    expect(joy.musicXml).toContain("<type>eighth</type>");
    expect(joy.musicXml).toContain("<dot/>");
  });

  it("has explicit lookup failures and exports the complete UI translation key set", () => {
    expect(findSongCourseSource("missing")).toBeUndefined();
    expect(findSongCourseNode("hot-cross-buns", "missing")).toBeUndefined();
    expect(SONG_COURSE_SOURCE_KEYS).toContain("Повторяем трудную фразу");
    for (const source of SONG_COURSE_SOURCES) {
      expect(SONG_COURSE_SOURCE_KEYS).toContain(source.title);
      for (const node of source.nodes)
        expect(SONG_COURSE_SOURCE_KEYS).toEqual(
          expect.arrayContaining([node.title, node.instruction])
        );
    }
  });
});
