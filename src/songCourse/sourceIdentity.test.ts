// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { findSongCourseSource } from "./catalog";
import { loadSongCourseSource } from "./loader";
import { courseSourceIdentities, parseCourseXml } from "./sourceIdentity";

const source = findSongCourseSource("hot-cross-buns");
if (!source) throw new Error("missing fixture");

describe("canonical course source identity", () => {
  it("counts XML rests in sourceIndex without inventing runtime identities for them", () => {
    const loaded = loadSongCourseSource(source);
    const document = parseCourseXml(source.musicXml);
    const xmlNotes = Array.from(document.querySelectorAll("note"));
    const identities = courseSourceIdentities(source, document);
    for (const identity of identities) {
      expect(xmlNotes[identity.sourceIndex]?.getAttribute("id")).toBe(identity.xmlId);
      const runtime = loaded.song.notes.find(
        (note) => note.id === loaded.sourceToRuntime.get(identity.canonicalId)
      );
      expect(runtime?.sourceIndex).toBe(identity.sourceIndex);
      expect(runtime?.part).toBe(identity.partId);
    }
    const rest = document.querySelector("note:has(rest)");
    if (!rest) throw new Error("missing rest");
    expect(identities.some((identity) => identity.sourceIndex === xmlNotes.indexOf(rest))).toBe(
      false
    );
    expect(loaded.runtimeToSource.size).toBe(identities.length);
  });

  it("keeps learner identity and hand when physical XML part order is reversed", () => {
    const original = loadSongCourseSource(source);
    const document = parseCourseXml(source.musicXml);
    const learner = document.querySelector('score-partwise > part[id="learner"]');
    const listLearner = document.querySelector('part-list > score-part[id="learner"]');
    if (!learner || !listLearner) throw new Error("missing learner part");
    learner.parentElement?.appendChild(learner);
    listLearner.parentElement?.appendChild(listLearner);
    const loaded = loadSongCourseSource({
      ...source,
      musicXml: new XMLSerializer().serializeToString(document)
    });
    const learnerNotes = loaded.song.notes.filter((note) => note.part === "learner");
    expect(learnerNotes.every((note) => note.hand === "right")).toBe(true);
    expect(learnerNotes.map((note) => note.pitch)).toEqual(
      original.song.notes.filter((note) => note.part === "learner").map((note) => note.pitch)
    );
    expect(new Set(loaded.sourceToRuntime.keys())).toEqual(
      new Set(original.sourceToRuntime.keys())
    );
    const id = "hot-cross-buns@1:hot-cross-buns-m1-n1";
    const identity = loaded.identities.find((note) => note.canonicalId === id);
    const originalIdentity = original.identities.find((note) => note.canonicalId === id);
    expect(identity?.sourceIndex).not.toBe(originalIdentity?.sourceIndex);
    expect(loaded.runtimeToSource.get(loaded.sourceToRuntime.get(id) ?? "")).toBe(id);
  });
});
