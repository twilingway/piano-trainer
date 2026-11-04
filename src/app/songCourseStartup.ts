import {
  findSongCourseNode,
  findSongCourseSource,
  SONG_COURSE_SOURCES
} from "../songCourse/catalog";
import { mergeSongCourseProgress } from "../songCourse/progress";
import type { SongCourseProgress, SongCourseSelection } from "../songCourse/model";
import type { songCourseRepository } from "./songCourseRepository";

export async function loadCourseProgress(
  repository: typeof songCourseRepository,
  current: () => SongCourseProgress,
  epoch: () => number,
  initialEpoch: number
): Promise<SongCourseProgress> {
  const saved = await repository.load();
  return epoch() === initialEpoch ? saved : mergeSongCourseProgress(saved, current(), true);
}

/** Stale score revisions and hashes never resume with old completion credit. */
export function initialCourseSelection(
  progress: SongCourseProgress,
  legacyActive: boolean
): SongCourseSelection | null {
  const saved = progress.selection;
  if (
    saved &&
    findSongCourseSource(saved.songId)?.revision === saved.sourceRevision &&
    findSongCourseSource(saved.songId)?.sourceHash === saved.sourceHash &&
    findSongCourseNode(saved.songId, saved.nodeId)
  )
    return saved;
  if (legacyActive) return null;
  const source = SONG_COURSE_SOURCES[0],
    node = source?.nodes[0];
  return source && node
    ? {
        songId: source.id,
        sourceRevision: source.revision,
        sourceHash: source.sourceHash,
        nodeId: node.id
      }
    : null;
}

export function nextCourseSelection(
  material: { source: (typeof SONG_COURSE_SOURCES)[number]; node: { id: string } } | null
): SongCourseSelection | null {
  if (!material) return null;
  const sourceIndex = SONG_COURSE_SOURCES.findIndex((source) => source.id === material.source.id);
  const nodes = material.source.nodes,
    index = nodes.findIndex((node) => node.id === material.node.id);
  const source =
    index >= 0 && nodes[index + 1] ? material.source : SONG_COURSE_SOURCES[sourceIndex + 1];
  const node = source === material.source ? nodes[index + 1] : source?.nodes[0];
  return source && node
    ? {
        songId: source.id,
        sourceRevision: source.revision,
        sourceHash: source.sourceHash,
        nodeId: node.id
      }
    : null;
}
