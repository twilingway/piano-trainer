import { validSongCourseResult } from "./progress";
import { songCourseEvidenceMatchesNode } from "./evidenceProof";
import { coursePath } from "./path";
import type { SongCourseNode, SongCourseResult, SongCourseSource } from "./model";

/** Keep the proof tied to its real node even when its credit is shown on an equivalent motif. */
export function coursePathResults(
  source: SongCourseSource,
  results: readonly SongCourseResult[],
  grouped = true
): ReadonlyMap<string, SongCourseResult> {
  const nodes = new Map(source.nodes.map((node) => [node.id, node]));
  const path = grouped ? coursePath(source) : undefined;
  const best = new Map<string, SongCourseResult>();
  for (const result of results) {
    const node: SongCourseNode | undefined = nodes.get(result.nodeId);
    if (
      !node ||
      !result.valid ||
      !result.completed ||
      result.rubricVariant !== "normal" ||
      result.songId !== source.id ||
      result.sourceRevision !== source.revision ||
      result.sourceHash !== source.sourceHash ||
      (node.kind === "performance" && result.mode !== "tempo") ||
      (node.kind === "review" && result.mode !== "wait") ||
      !validSongCourseResult(result) ||
      !songCourseEvidenceMatchesNode(result, source, node)
    )
      continue;
    const id = path?.representativeById.get(node.id) ?? node.id;
    const previous = best.get(id);
    if (
      !previous ||
      result.stars > previous.stars ||
      (result.stars === previous.stars && result.createdAt > previous.createdAt)
    )
      best.set(id, result);
  }
  return best;
}
