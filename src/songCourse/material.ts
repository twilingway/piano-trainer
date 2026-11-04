import { quartersAt } from "../song/song";
import type { PlayableRange } from "../practice/playableRange";
import type { CourseMaterial, SongCourseNode, SongCourseSource } from "./model";
import { loadSongCourseSource } from "./loader";
import { fragmentCourseXml } from "./sourceFragment";
import { parseCourseXml } from "./sourceIdentity";

export function buildSongCourseMaterial(
  source: SongCourseSource,
  nodeOrId: SongCourseNode | string
): CourseMaterial {
  const node =
    typeof nodeOrId === "string" ? source.nodes.find((value) => value.id === nodeOrId) : nodeOrId;
  if (node?.songId !== source.id || !node.sourceNoteIds.length)
    throw new Error("song-course-node-unavailable");
  const full = loadSongCourseSource(source);
  const wanted = new Set(node.sourceNoteIds);
  const selected = full.identities.filter(
    (identity) => source.learnerPartIds.includes(identity.partId) && wanted.has(identity.xmlId)
  );
  if (selected.length !== wanted.size) throw new Error("song-course-invalid-node-selection");
  const fromMeasure = Math.min(...selected.map((note) => note.measureIndex));
  const toMeasure = Math.max(...selected.map((note) => note.measureIndex)) + 1;
  const first = full.song.measures[fromMeasure];
  const last = full.song.measures[toMeasure - 1];
  if (!first || !last) throw new Error("song-course-invalid-measure-range");
  const selectedCanonical = new Set(selected.map((identity) => identity.canonicalId));
  const selectedNotes = full.song.notes.filter((note) =>
    selectedCanonical.has(full.runtimeToSource.get(note.id) ?? "")
  );
  const exact = node.kind === "notes" || node.kind === "duration";
  const firstOffset = exact
    ? Math.min(...selectedNotes.map((note) => note.startBeat)) - first.start
    : 0;
  const lastEnd = exact
    ? Math.max(...selectedNotes.map((note) => quartersAt(full.song, note.start + note.duration))) -
      last.start
    : last.length;
  const musicXml = fragmentCourseXml(source, wanted, fromMeasure, toMeasure, firstOffset, lastEnd);
  const loaded = loadSongCourseSource(source, musicXml);
  const original = new Map(full.identities.map((identity) => [identity.canonicalId, identity]));
  const expected = loaded.song.notes
    .filter((note) => source.learnerPartIds.includes(note.part ?? ""))
    .map((note) => {
      const sourceNoteId = loaded.runtimeToSource.get(note.id) ?? "";
      const identity = original.get(sourceNoteId);
      const phrase =
        identity && source.phrases.find((value) => value.sourceNoteIds.includes(identity.xmlId));
      if (!identity || !phrase) throw new Error("song-course-unmapped-fragment-note");
      return {
        sourceNoteId,
        runtimeNoteId: note.id,
        pitch: note.pitch,
        start: note.start,
        duration: note.duration,
        startBeat: note.startBeat,
        phraseId: phrase.id,
        measureIndex: identity.measureIndex
      };
    });
  return {
    source,
    node,
    song: loaded.song,
    musicXml,
    expected,
    runtimeToSource: loaded.runtimeToSource,
    sourceToRuntime: loaded.sourceToRuntime
  };
}

export interface SongCourseReviewBlock {
  readonly fromMeasure: number;
  readonly toMeasure: number;
  readonly phraseIds: readonly string[];
  readonly sourceNoteIds?: readonly string[];
}

export function buildSongCourseReviewMaterial(
  source: SongCourseSource,
  block: SongCourseReviewBlock,
  reviewId: string
): CourseMaterial {
  const full = loadSongCourseSource(source);
  if (
    !reviewId ||
    !Number.isInteger(block.fromMeasure) ||
    !Number.isInteger(block.toMeasure) ||
    block.fromMeasure < 0 ||
    block.toMeasure <= block.fromMeasure ||
    block.toMeasure - block.fromMeasure > 4 ||
    block.toMeasure > full.song.measures.length ||
    !block.phraseIds.length ||
    block.phraseIds.some(
      (id) =>
        !source.phrases.some(
          (phrase) =>
            phrase.id === id &&
            phrase.fromMeasure < block.toMeasure &&
            phrase.toMeasure > block.fromMeasure
        )
    )
  )
    throw new Error("song-course-invalid-review");
  const eligible = full.identities.filter(
    (note) =>
      source.learnerPartIds.includes(note.partId) &&
      note.measureIndex >= block.fromMeasure &&
      note.measureIndex < block.toMeasure
  );
  const allowed = block.sourceNoteIds === undefined ? undefined : new Set(block.sourceNoteIds);
  if (
    allowed &&
    (!allowed.size ||
      [...allowed].some(
        (id) =>
          !full.identities.some(
            (note) => source.learnerPartIds.includes(note.partId) && note.canonicalId === id
          )
      ))
  )
    throw new Error("song-course-invalid-review-context");
  const ids = eligible
    .filter((note) => allowed === undefined || allowed.has(note.canonicalId))
    .map((note) => note.xmlId);
  if (!ids.length) throw new Error("song-course-empty-review");
  return buildSongCourseMaterial(source, {
    id: `${source.id}/review/${reviewId}`,
    songId: source.id,
    kind: "review",
    title: "Повторяем трудную фразу",
    instruction: "Сыграйте трудное место ещё раз, сохраняя ритм и длину звуков.",
    phraseIds: block.phraseIds,
    sourceNoteIds: ids
  });
}

/** The display follows learner notes only, never the bass played by the computer. */
export function courseDisplayRange(material: CourseMaterial): PlayableRange {
  if (!material.expected.length) throw new Error("song-course-no-learner-notes");
  const lowPitch = Math.min(...material.expected.map((note) => note.pitch));
  const highPitch = Math.max(...material.expected.map((note) => note.pitch));
  const low = Math.floor(lowPitch / 12) * 12;
  const high = Math.max(low + 12, Math.ceil(highPitch / 12) * 12);
  if (high - low > 24) throw new Error("song-course-display-range-too-wide");
  return { low, high };
}

/** A display-only XML pass; playback still uses material.song with both explicit roles. */
export function learnerScoreXml(material: CourseMaterial): string {
  const document = parseCourseXml(material.musicXml);
  const keep = new Set(material.source.learnerPartIds);
  for (const part of Array.from(
    document.querySelectorAll("score-partwise > part, part-list > score-part")
  )) {
    if (!keep.has(part.getAttribute("id") ?? "")) part.remove();
  }
  return new XMLSerializer().serializeToString(document);
}
