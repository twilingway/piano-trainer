import type { SongCourseNode, SongCourseSource } from "./model";

/** Legacy nodes remain resolvable without appearing as extra steps in the current path. */
export function allCourseNodes(source: SongCourseSource): readonly SongCourseNode[] {
  return [...source.nodes, ...(source.legacyNodes ?? [])];
}
export function findSourceCourseNode(
  source: SongCourseSource,
  id: string
): SongCourseNode | undefined {
  return allCourseNodes(source).find((node) => node.id === id);
}

/** Derived attacks have their own explicit identities; the origin never impersonates four notes. */
export function expectedNodeRawIds(node: SongCourseNode): readonly string[] {
  const repeat = node.repeat;
  if (!repeat) return node.sourceNoteIds;
  if (
    node.kind !== "notes" ||
    ![4].includes(repeat.count) ||
    node.sourceNoteIds.length !== 1 ||
    node.sourceNoteIds[0] !== repeat.originNoteId
  )
    throw new Error("song-course-invalid-repeat-definition");
  return Array.from(
    { length: repeat.count },
    (_, index) => `practice-${node.id.replaceAll("/", "-")}-n${String(index + 1)}`
  );
}
