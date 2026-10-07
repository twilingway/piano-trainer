import { useCallback, useEffect, useMemo } from "react";

import { compareTake } from "../recording/compare";
import type { Grade } from "../recording/compare";
import { takeAsSong, takeToMidi } from "../recording/playback";
import type { Take } from "../recording/take";
import { transcribeTake } from "../recording/transcribe";
import type { TranscribedGrade } from "../recording/transcribe";
import { musicXmlWithLineBreaks } from "../song/musicxml";
import type { Song } from "../song/song";
import { markKey } from "../staff/Staff";

import { reviewActions, type SplitDirection, type TakeStaff } from "./reviewSlice";
import { useAppDispatch, useAppSelector, useAppStore } from "./storeHooks";
export type { SplitDirection, TakeStaff } from "./reviewSlice";
const EMPTY_TAKES: readonly Take[] = [];

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
  /** Open the review by itself when a take ends; otherwise only on the player's ask. */
  readonly autoReview: boolean;
}

/**
 * The takes of the song on screen: the history, the last take and its review,
 * the comparison with the original and the take written out as a score.
 */
export function useTakeReview(
  song: Song,
  songKey: string,
  ensureSound: () => Promise<void>,
  { withNames, fixedLines, measuresPerLine, autoReview }: StaffLayout
) {
  const dispatch = useAppDispatch(),
    store = useAppStore();
  const takes = useAppSelector((state) => state.review.historyBySong[songKey] ?? EMPTY_TAKES);
  const context = useAppSelector((state) => state.review.songKey);
  const selectedId = useAppSelector((state) => state.review.selectedId);
  const storedComparing = useAppSelector((state) => state.review.comparing);
  const splitDirection = useAppSelector((state) => state.review.splitDirection);
  const replayCount = useAppSelector((state) => state.review.replayCount);
  const takeStaff = useAppSelector((state) => state.review.takeStaff);
  const storedShown = useAppSelector((state) => state.review.reviewShown);
  const comparing = context === songKey && storedComparing;
  const reviewShown = context === songKey && storedShown;
  const selected = context === songKey ? takes.find((take) => take.id === selectedId) : undefined;
  const lastTake = useMemo(
    () => (selected ? { take: selected, review: compareTake(song, selected) } : null),
    [selected, song]
  );
  useEffect(() => {
    dispatch(reviewActions.contextChanged(songKey));
  }, [dispatch, songKey]);
  const recordTake = useCallback(
    (take: Take) => {
      dispatch(reviewActions.takeCompleted({ take, autoReview }));
    },
    [dispatch, autoReview]
  );
  const showReview = useCallback(() => {
    dispatch(reviewActions.reviewShownChanged(true));
  }, [dispatch]);
  const selectTake = useCallback(
    (id: string) => {
      dispatch(reviewActions.takeSelected(id));
    },
    [dispatch]
  );
  const startComparing = useCallback(async () => {
    const before = store.getState().review;
    const id = before.selectedId;
    await ensureSound();
    const current = store.getState().review;
    if (current.songKey === songKey && current.selectedId === id && id !== null)
      dispatch(reviewActions.comparingChanged(true));
  }, [store, ensureSound, songKey, dispatch]);
  const replay = useCallback(() => {
    dispatch(reviewActions.replayRequested());
  }, [dispatch]);
  const hideReview = useCallback(() => {
    dispatch(reviewActions.reviewHidden());
  }, [dispatch]);
  const downloadLastTake = () => {
    if (lastTake) downloadTake(lastTake.take, song.title);
  };
  const setComparing = (value: boolean) => {
    dispatch(reviewActions.comparingChanged(value));
  };
  const setSplitDirection = (value: SplitDirection) => {
    dispatch(reviewActions.splitDirectionChanged(value));
  };
  const setTakeStaff = (value: TakeStaff) => {
    dispatch(reviewActions.takeStaffChanged(value));
  };

  // The take as a song, sounding with its own velocities, while comparing.
  const compareSong = useMemo(
    () => (comparing && lastTake ? takeAsSong(lastTake.take, song, lastTake.review) : undefined),
    [comparing, lastTake, song]
  );

  // A take belongs to the song and level it was played on; another song shows no review.
  const takeReview = lastTake?.take.songKey === songKey ? lastTake.review : undefined;
  const review = reviewShown ? takeReview : undefined;
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
    /** The last take has a review to open. */
    canReview: takeReview !== undefined,
    showReview,
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
