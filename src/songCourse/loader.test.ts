// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { findSongCourseSource } from "./catalog";
import { loadSongCourseSource } from "./loader";
import { ownsNote } from "../practice/playableRange";
import { PracticeSession } from "../practice/session";
import type { SongCourseSource } from "./model";

const original = findSongCourseSource("hot-cross-buns");
if (!original) throw new Error("missing fixture");
const source: SongCourseSource = original;

describe("explicit course source roles", () => {
  it("owns only the learner part even when both score parts are right-hand parts", () => {
    const bothRight: SongCourseSource = {
      ...source,
      partHands: source.partHands.map((entry) => ({ ...entry, hand: "right" }))
    };
    const loaded = loadSongCourseSource(bothRight);
    expect(loaded.song.notes.every((note) => note.hand === "right")).toBe(true);
    const owned = loaded.song.notes.filter((note) =>
      ownsNote(note, new Set(["right"]), undefined, new Set(["learner"]))
    );
    expect(owned).toHaveLength(17);
    expect(loaded.song.notes.filter((note) => note.part === "accompaniment")).toHaveLength(16);
    const session = new PracticeSession(loaded.song, {
      mode: "wait",
      hands: new Set(["right"]),
      parts: new Set(["learner"]),
      speed: 1,
      countInBeats: 0
    });
    const events = session.advance(0.01);
    expect(session.nextDue().map((note) => note.pitch)).toEqual([64]);
    expect(
      events.filter((event) => event.type === "autoNoteOn").map((event) => event.pitch)
    ).toEqual([48]);
  });

  it.each([
    { learnerPartIds: [] },
    { accompanimentPartIds: [] },
    { learnerPartIds: ["missing"] },
    { accompanimentPartIds: ["learner"] },
    { learnerPartIds: ["learner", "learner"] },
    { partHands: [{ partId: "learner", staff: "1", hand: "right" as const }] }
  ])(
    "rejects unknown, empty or intersecting role metadata before a session starts: %j",
    (change) => {
      expect(() => loadSongCourseSource({ ...source, ...change })).toThrow();
    }
  );

  it("rejects missing and duplicated source IDs and a missing learner voice", () => {
    expect(() =>
      loadSongCourseSource({
        ...source,
        musicXml: source.musicXml.replace('id="hot-cross-buns-m1-n1"', "")
      })
    ).toThrow("song-course-missing-note-id");
    expect(() =>
      loadSongCourseSource({
        ...source,
        musicXml: source.musicXml.replace('id="hot-cross-buns-m1-n2"', 'id="hot-cross-buns-m1-n1"')
      })
    ).toThrow("song-course-duplicate-note-id");
    const document = new DOMParser().parseFromString(source.musicXml, "application/xml");
    for (const note of Array.from(document.querySelectorAll('part[id="learner"] note pitch')))
      note.remove();
    expect(() =>
      loadSongCourseSource({ ...source, musicXml: new XMLSerializer().serializeToString(document) })
    ).toThrow("song-course-no-learner-notes");
  });

  it("rejects learner chords while allowing simultaneous computer accompaniment", () => {
    const document = new DOMParser().parseFromString(source.musicXml, "application/xml");
    const note = document.querySelector('part[id="learner"] note + note');
    if (!note) throw new Error("missing note");
    note.insertBefore(document.createElement("chord"), note.firstChild);
    expect(() =>
      loadSongCourseSource({ ...source, musicXml: new XMLSerializer().serializeToString(document) })
    ).toThrow("song-course-learner-must-be-monophonic");
    const accompaniment = new DOMParser().parseFromString(source.musicXml, "application/xml");
    const first = accompaniment.querySelector('part[id="accompaniment"] note');
    if (!first) throw new Error("missing accompaniment");
    const extra = first.cloneNode(true) as Element;
    extra.setAttribute("id", "additional-auto-chord-tone");
    extra.insertBefore(accompaniment.createElement("chord"), extra.firstChild);
    first.after(extra);
    expect(
      loadSongCourseSource({
        ...source,
        musicXml: new XMLSerializer().serializeToString(accompaniment)
      }).song.notes.filter((item) => item.part === "accompaniment")
    ).toHaveLength(17);
  });

  it("rejects uncovered sounding parts, invalid phrase references and malformed scores", () => {
    const document = new DOMParser().parseFromString(source.musicXml, "application/xml");
    const extra = document.querySelector('part[id="accompaniment"]')?.cloneNode(true) as
      Element | undefined;
    if (!extra) throw new Error("missing part");
    extra.setAttribute("id", "unknown-part");
    for (const note of Array.from(extra.querySelectorAll("note")))
      note.setAttribute("id", `unknown-${note.getAttribute("id") ?? ""}`);
    document.querySelector("score-partwise")?.appendChild(extra);
    expect(() =>
      loadSongCourseSource({ ...source, musicXml: new XMLSerializer().serializeToString(document) })
    ).toThrow("song-course-missing-role");
    expect(() => loadSongCourseSource({ ...source, phrases: [] })).toThrow(
      "song-course-unassigned-phrase"
    );
    expect(() => loadSongCourseSource({ ...source, musicXml: "<bad" })).toThrow();
  });
});
