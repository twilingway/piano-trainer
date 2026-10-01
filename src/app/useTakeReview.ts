import { useMemo, useState } from "react";

import { compareTake } from "../recording/compare";
import type { Grade, TakeReview } from "../recording/compare";
import { loadTakes, saveTake } from "../recording/history";
import { takeAsSong, takeToMidi } from "../recording/playback";
import type { Take } from "../recording/take";
import { transcribeTake } from "../recording/transcribe";
import type { TranscribedGrade } from "../recording/transcribe";
import { musicXmlWithLineBreaks } from "../song/musicxml";
import type { Song } from "../song/song";
import { markKey } from "../staff/Staff";

export type SplitDirection = "row" | "column";
/** The take's own staff: hidden, beside the original, or under it. */
export type TakeStaff = "off" | SplitDirection;

/** Staff colours of a written-out take: the review's, and red for a key that matched no note. */
const TRANSCRIBED_COLORS: Readonly<Record<TranscribedGrade, string>> = {
  good: "#2e9e4f",
  inaccurate: "#e08a00",
  missed: "#e63946",
  extra: "#e63946"
};

/** Staff colours of a reviewed note: clean, off in rhythm, length or touch, not played. */
const GRADE_COLORS: Readonly<Record<Grade, string>> = {
  good: "#2e9e4f",
  inaccurate: "#e08a00",
  missed: "#e63946"
};

function downloadTake(take: Take, title: string): void {
  const bytes = new Uint8Array(takeToMidi(take, title));
  const url = URL.createObjectURL(new Blob([bytes], { type: "audio/midi" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${title} ${take.createdAt.slice(0, 16).replace(/[T:]/g, "-")}.mid`;
  link.click();
  URL.revokeObjectURL(url);
}

interface StaffLayout {
  readonly withNames: (xml: string) => string;
  readonly fixedLines: boolean;
  readonly measuresPerLine: number;
}

/**
 * The takes of the song on screen: the history, the last take and its review,
 * the comparison with the original and the take written out as a score.
 */
export function useTakeReview(
  song: Song,
  songKey: string,
  ensureSound: () => Promise<void>,
  { withNames, fixedLines, measuresPerLine }: StaffLayout
) {
  /** The last take and how it compares with the score. */
  const [lastTake, setLastTake] = useState<{ take: Take; review: TakeReview } | null>(null);
  const [takes, setTakes] = useState<Take[]>([]);
  /** The take playing on one screen against the original on the other. */
  const [comparing, setComparing] = useState(false);
  const [splitDirection, setSplitDirection] = useState<SplitDirection>("row");
  /** Bumped to play the comparison again from its start. */
  const [replayCount, setReplayCount] = useState(0);
  const [takeStaff, setTakeStaff] = useState<TakeStaff>("off");

  // Each song and level keeps its own takes.
  const [takesOf, setTakesOf] = useState<string | null>(null);
  if (takesOf !== songKey) {
    // Another song or level: its own history, and nothing of the last one on screen.
    setTakesOf(songKey);
    setTakes(loadTakes(songKey));
    setLastTake(null);
    setComparing(false);
  }

  /** A finished take is compared with the song on screen now. */
  const recordTake = (take: Take) => {
    setTakes(saveTake(take));
    setLastTake({ take, review: compareTake(song, take) });
  };

  const selectTake = (id: string) => {
    const take = takes.find((item) => item.id === id);
    if (take) setLastTake({ take, review: compareTake(song, take) });
  };

  const startComparing = async () => {
    await ensureSound();
    setComparing(true);
  };

  const replay = () => {
    setReplayCount((count) => count + 1);
  };

  const hideReview = () => {
    setComparing(false);
    setLastTake(null);
  };

  const downloadLastTake = () => {
    if (lastTake) downloadTake(lastTake.take, song.title);
  };

  // The take as a song, sounding with its own velocities, while comparing.
  const compareSong = useMemo(
    () => (comparing && lastTake ? takeAsSong(lastTake.take, song, lastTake.review) : undefined),
    [comparing, lastTake, song]
  );

  // A take belongs to the song and level it was played on; another song shows no review.
  const review = lastTake?.take.songKey === songKey ? lastTake.review : undefined;
  const reviewMarks = useMemo(
    () =>
      review
        ? new Map(
            review.notes.map((item) => [
              markKey(item.note.startBeat, item.note.pitch),
              GRADE_COLORS[item.grade]
            ])
          )
        : undefined,
    [review]
  );

  // The take written out as a score, laid out in the same lines as the original.
  const transcription = useMemo(() => {
    if (!review || !lastTake || takeStaff === "off") return undefined;
    const written = transcribeTake(song, lastTake.take, review);
    const named = withNames(written.musicXml);
    const musicXml = fixedLines ? musicXmlWithLineBreaks(named, measuresPerLine) : named;
    const marks = new Map(
      [...written.grades].map(([key, grade]) => {
        const [beat = "0", pitch = "0"] = key.split(":");
        return [markKey(Number(beat), Number(pitch)), TRANSCRIBED_COLORS[grade]] as const;
      })
    );
    return { musicXml, marks };
  }, [review, lastTake, takeStaff, song, fixedLines, measuresPerLine, withNames]);

  return {
    takes,
    lastTake,
    review,
    reviewMarks,
    transcription,
    comparing,
    setComparing,
    compareSong,
    splitDirection,
    setSplitDirection,
    replayCount,
    replay,
    takeStaff,
    setTakeStaff,
    recordTake,
    selectTake,
    startComparing,
    hideReview,
    downloadLastTake
  };
}
