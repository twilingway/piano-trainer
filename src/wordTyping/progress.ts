import type { NoteStatus } from "../practice/session";
import type { GeneratedToken } from "./types";

/** Undefined statuses after a session load belong outside the playable range. */
export function textProgress(
  tokens: readonly GeneratedToken[],
  statuses: Readonly<Record<string, NoteStatus | undefined>> | undefined,
  time: number,
  listening: boolean
) {
  const statusOf = (token: GeneratedToken): NoteStatus =>
    statuses ? (statuses[token.noteId] ?? "skipped") : "pending";
  const index = tokens.findIndex((token) =>
    listening ? time < token.start + token.duration : statusOf(token) === "pending"
  );
  const holding = tokens.findLast(
    (token) =>
      (listening || statusOf(token) === "hit") &&
      time >= token.start &&
      time < token.start + token.duration
  );
  const holdProgress = holding
    ? Math.max(0, Math.min(1, (time - holding.start) / Math.max(0.001, holding.duration)))
    : 0;
  return { index, holding, holdProgress, statuses: tokens.map(statusOf) };
}
