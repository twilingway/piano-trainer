import type { Hand } from "../fingering/fingering";
import type { SongCourseSource } from "./model";

export interface CourseSourceIdentity {
  readonly xmlId: string;
  readonly canonicalId: string;
  readonly partId: string;
  readonly staff: string;
  readonly hand: Hand;
  readonly measureIndex: number;
  readonly sourceIndex: number;
}
const validHands: ReadonlySet<string> = new Set(["left", "right"]);

export function courseSourceNoteId(
  source: Pick<SongCourseSource, "id" | "revision">,
  xmlId: string
): string {
  return `${source.id}@${source.revision}:${xmlId}`;
}

export function parseCourseXml(xml: string): Document {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror") || !document.querySelector("score-partwise"))
    throw new Error("song-course-invalid-xml");
  return document;
}

/** Explicit roles and hands are validated before the ordinary score parser is used. */
export function courseSourceIdentities(
  source: SongCourseSource,
  document: Document
): readonly CourseSourceIdentity[] {
  if (!/^[a-f0-9]{64}$/.test(source.sourceHash)) throw new Error("song-course-invalid-source-hash");
  const parts = Array.from(document.querySelectorAll("score-partwise > part"));
  const known = new Set(parts.map((part) => part.getAttribute("id") ?? ""));
  const learner = new Set(source.learnerPartIds);
  const accompaniment = new Set(source.accompanimentPartIds);
  if (
    !source.id ||
    !source.revision ||
    !learner.size ||
    !accompaniment.size ||
    learner.size !== source.learnerPartIds.length ||
    accompaniment.size !== source.accompanimentPartIds.length ||
    known.size !== parts.length ||
    known.has("") ||
    [...learner].some((id) => !known.has(id) || accompaniment.has(id)) ||
    [...accompaniment].some((id) => !known.has(id))
  )
    throw new Error("song-course-invalid-roles");
  const hands = new Map<string, Hand>();
  for (const entry of source.partHands) {
    const key = `${entry.partId}:${entry.staff}`;
    if (!known.has(entry.partId) || !entry.staff || hands.has(key) || !validHands.has(entry.hand))
      throw new Error("song-course-invalid-hands");
    hands.set(key, entry.hand);
  }
  const indices = new Map(
    Array.from(document.querySelectorAll("note")).map((note, index) => [note, index])
  );
  const ids = new Set<string>();
  const identities: CourseSourceIdentity[] = [];
  for (const part of parts) {
    const partId = part.getAttribute("id") ?? "";
    const measures = Array.from(part.querySelectorAll(":scope > measure"));
    for (const [measureIndex, measure] of measures.entries()) {
      for (const note of Array.from(measure.querySelectorAll(":scope > note"))) {
        const id = note.getAttribute("id") ?? "";
        if (id && ids.has(id)) throw new Error("song-course-duplicate-note-id");
        if (id) ids.add(id);
        if (
          !note.querySelector(":scope > pitch") ||
          note.querySelector(":scope > grace, :scope > cue")
        )
          continue;
        if (!id) throw new Error("song-course-missing-note-id");
        if (!learner.has(partId) && !accompaniment.has(partId))
          throw new Error("song-course-missing-role");
        const staff = note.querySelector(":scope > staff")?.textContent.trim() ?? "1";
        const hand = hands.get(`${partId}:${staff}`);
        if (!hand) throw new Error("song-course-missing-hand");
        identities.push({
          xmlId: id,
          canonicalId: courseSourceNoteId(source, id),
          partId,
          staff,
          hand,
          measureIndex,
          sourceIndex: indices.get(note) ?? -1
        });
      }
    }
  }
  return identities;
}
