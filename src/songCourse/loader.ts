import { allCourseNodes, expectedNodeRawIds } from "./nodeIdentity";
import { songFromMusicXml } from "../song/musicxml";
import { secondsAt, type Song } from "../song/song";
import type { SongCourseSource } from "./model";
import {
  courseSourceIdentities,
  parseCourseXml,
  type CourseSourceIdentity
} from "./sourceIdentity";

export interface LoadedSongCourseSource {
  readonly song: Song;
  readonly musicXml: string;
  readonly runtimeToSource: ReadonlyMap<string, string>;
  readonly sourceToRuntime: ReadonlyMap<string, string>;
  readonly identities: readonly CourseSourceIdentity[];
}

function validateReferences(
  source: SongCourseSource,
  identities: readonly CourseSourceIdentity[],
  song: Song
): void {
  const learner = new Set(source.learnerPartIds);
  const notes = new Map(
    identities.filter((note) => learner.has(note.partId)).map((note) => [note.xmlId, note])
  );
  const phraseIds = new Set<string>();
  const covered = new Set<string>();
  for (const phrase of source.phrases) {
    if (
      !phrase.id ||
      phraseIds.has(phrase.id) ||
      !Number.isInteger(phrase.fromMeasure) ||
      !Number.isInteger(phrase.toMeasure) ||
      phrase.fromMeasure < 0 ||
      phrase.toMeasure <= phrase.fromMeasure ||
      phrase.toMeasure > song.measures.length ||
      !phrase.sourceNoteIds.length
    )
      throw new Error("song-course-invalid-phrase");
    phraseIds.add(phrase.id);
    for (const id of phrase.sourceNoteIds) {
      const note = notes.get(id);
      if (
        !note ||
        covered.has(id) ||
        note.measureIndex < phrase.fromMeasure ||
        note.measureIndex >= phrase.toMeasure
      )
        throw new Error("song-course-invalid-phrase-note");
      covered.add(id);
    }
  }
  if (covered.size !== notes.size) throw new Error("song-course-unassigned-phrase");
  const nodeIds = new Set<string>();
  for (const node of allCourseNodes(source)) {
    expectedNodeRawIds(node);
    if (
      !node.id ||
      nodeIds.has(node.id) ||
      node.songId !== source.id ||
      !node.sourceNoteIds.length ||
      new Set(node.sourceNoteIds).size !== node.sourceNoteIds.length ||
      node.sourceNoteIds.some((id) => !notes.has(id)) ||
      !node.phraseIds.length ||
      node.phraseIds.some((id) => !phraseIds.has(id))
    )
      throw new Error("song-course-invalid-node");
    nodeIds.add(node.id);
  }
  if (!nodeIds.size) throw new Error("song-course-empty-path");
}

/** Fragment overrides keep source XML IDs, but cannot contain the full catalog's deleted notes. */
export function loadSongCourseSource(
  source: SongCourseSource,
  musicXml?: string
): LoadedSongCourseSource {
  const xml = musicXml ?? source.musicXml;
  const identities = courseSourceIdentities(source, parseCourseXml(xml));
  const byIndex = new Map(identities.map((identity) => [identity.sourceIndex, identity]));
  const parsed = songFromMusicXml(xml, source.title);
  const runtimeToSource = new Map<string, string>();
  const sourceToRuntime = new Map<string, string>();
  const notes = parsed.notes.map((note) => {
    const identity = note.sourceIndex === undefined ? undefined : byIndex.get(note.sourceIndex);
    if (!identity || sourceToRuntime.has(identity.canonicalId))
      throw new Error("song-course-invalid-source-map");
    runtimeToSource.set(note.id, identity.canonicalId);
    sourceToRuntime.set(identity.canonicalId, note.id);
    return {
      ...note,
      part: identity.partId,
      hand: identity.hand,
      ...(note.scoreFinger === undefined ? {} : { finger: note.scoreFinger })
    };
  });
  const learner = notes.filter((note) => source.learnerPartIds.includes(note.part));
  if (!learner.length) throw new Error("song-course-no-learner-notes");
  for (const [index, note] of learner.entries()) {
    const previous = learner[index - 1];
    if (
      !Number.isFinite(note.start) ||
      note.start < 0 ||
      !Number.isFinite(note.duration) ||
      note.duration <= 0 ||
      (previous && previous.start + previous.duration > note.start + 1e-7)
    )
      throw new Error("song-course-learner-must-be-monophonic");
  }
  const lastMeasure = parsed.measures.at(-1);
  const scoreEnd = lastMeasure
    ? secondsAt(parsed, lastMeasure.start + lastMeasure.length)
    : parsed.duration;
  const song: Song = {
    ...parsed,
    duration: Math.max(parsed.duration, scoreEnd),
    notes,
    parts: [...source.learnerPartIds, ...source.accompanimentPartIds].map((id) => ({
      id,
      role: source.learnerPartIds.includes(id) ? "melody" : "accompaniment",
      title: source.learnerPartIds.includes(id) ? "Мелодия" : "Аккомпанемент",
      hand: identities.find((note) => note.partId === id)?.hand ?? "left"
    }))
  };
  if (musicXml === undefined) validateReferences(source, identities, song);
  return { song, musicXml: xml, runtimeToSource, sourceToRuntime, identities };
}
