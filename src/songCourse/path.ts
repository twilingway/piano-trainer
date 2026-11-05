import { quartersAt } from "../song/song";
import { loadSongCourseSource, type LoadedSongCourseSource } from "./loader";
import type { SongCourseNode, SongCourseSource } from "./model";

export interface SongCoursePath {
  readonly nodes: readonly SongCourseNode[];
  readonly repeats: readonly SongCourseNode[];
  readonly representativeById: ReadonlyMap<string, string>;
}
const cache = new WeakMap<SongCourseSource, SongCoursePath>();
const beat = (value: number) => Math.round(value * 1e7) / 1e7;

function signature(
  source: SongCourseSource,
  node: SongCourseNode,
  loaded: LoadedSongCourseSource
): string | undefined {
  if (node.kind !== "guided-phrase" && node.kind !== "independent-phrase") return undefined;
  const phrases = source.phrases.filter((phrase) => node.phraseIds.includes(phrase.id));
  if (!phrases.length) return undefined;
  const from = Math.min(...phrases.map((phrase) => phrase.fromMeasure));
  const to = Math.max(...phrases.map((phrase) => phrase.toMeasure));
  const start = loaded.song.measures[from]?.start;
  if (start === undefined) return undefined;
  const wanted = new Set(node.sourceNoteIds);
  const identities = new Map(
    loaded.identities
      .filter((item) => wanted.has(item.xmlId))
      .map((item) => [item.canonicalId, item])
  );
  const notes = loaded.song.notes.flatMap((note) => {
    const identity = identities.get(loaded.runtimeToSource.get(note.id) ?? "");
    return identity && source.learnerPartIds.includes(identity.partId)
      ? [
          [
            note.pitch,
            beat(note.startBeat - start),
            beat(quartersAt(loaded.song, note.start + note.duration) - note.startBeat),
            note.scoreFinger ?? null,
            note.hand,
            identity.partId,
            identity.staff
          ]
        ]
      : [];
  });
  if (notes.length !== wanted.size) return undefined;
  const measures = loaded.song.measures
    .slice(from, to)
    .map((measure) => [measure.length, measure.beats, measure.beatType]);
  return JSON.stringify([node.kind, measures, notes]);
}

/** A cached display projection; original source nodes, identities and music stay untouched. */
export function coursePath(source: SongCourseSource): SongCoursePath {
  const previous = cache.get(source);
  if (previous) return previous;
  const nodes: SongCourseNode[] = [],
    repeats: SongCourseNode[] = [];
  const representativeById = new Map<string, string>();
  const seen = new Map<string, string>();
  const loaded = source.nodes.some(
    (node) => node.kind === "guided-phrase" || node.kind === "independent-phrase"
  )
    ? loadSongCourseSource(source)
    : undefined;
  for (const node of source.nodes) {
    const key = loaded && signature(source, node, loaded);
    const representative = key ? seen.get(key) : undefined;
    representativeById.set(node.id, representative ?? node.id);
    if (representative) repeats.push(node);
    else {
      nodes.push(node);
      if (key) seen.set(key, node.id);
    }
  }
  const result = {
    nodes: Object.freeze(nodes),
    repeats: Object.freeze(repeats),
    representativeById
  };
  cache.set(source, result);
  return result;
}

/** A legacy repeat advances from its actual catalog position, never back to its representative. */
export function nextCoursePathNode(
  source: SongCourseSource,
  nodeId: string
): SongCourseNode | undefined {
  const index = source.nodes.findIndex((node) => node.id === nodeId);
  if (index < 0) return undefined;
  const visible = new Set(coursePath(source).nodes.map((node) => node.id));
  return source.nodes.slice(index + 1).find((node) => visible.has(node.id));
}
