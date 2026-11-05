import { coursePath, nextCoursePathNode } from "../songCourse/path";
import { courseLearnerMode } from "../songCourse/listenRepeat";
import {
  findSongCourseNode,
  findSongCourseSource,
  SONG_COURSE_SOURCES
} from "../songCourse/catalog";
import { mergeSongCourseProgress } from "../songCourse/progress";
import { SongCourseAttempt } from "../songCourse/attempt";
import type { CourseMaterial, SongCourseProgress, SongCourseSelection } from "../songCourse/model";
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
    return {
      ...saved,
      nodeId: findSongCourseNode(saved.songId, saved.nodeId)?.supersededBy ?? saved.nodeId
    };
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
  const currentId =
    findSongCourseNode(material.source.id, material.node.id)?.supersededBy ?? material.node.id;
  const next = nextCoursePathNode(material.source, currentId);
  const source = next ? material.source : SONG_COURSE_SOURCES[sourceIndex + 1];
  const node = next ?? (source && coursePath(source).nodes[0]);
  return source && node
    ? {
        songId: source.id,
        sourceRevision: source.revision,
        sourceHash: source.sourceHash,
        nodeId: node.id
      }
    : null;
}

/** Assemble an attempt from the same source material and an owner-provided run identity. */
export function newCourseAttempt(
  material: CourseMaterial,
  speed: number,
  runId: string
): SongCourseAttempt {
  return new SongCourseAttempt({
    runId,
    songId: material.source.id,
    sourceRevision: material.source.revision,
    sourceHash: material.source.sourceHash,
    nodeId: material.node.id,
    mode: courseLearnerMode(material.node.kind),
    speed,
    expected: material.expected,
    learnerPartIds: material.source.learnerPartIds,
    ...(material.node.kind === "review" ? { rubricVariant: "learning-review" as const } : {})
  });
}

export function courseHelped(material: CourseMaterial | null): boolean {
  return material?.node.kind !== "independent-phrase" && material?.node.kind !== "performance";
}
