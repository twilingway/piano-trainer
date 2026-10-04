import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { WordLaneView } from "../render/WordLaneView";
import type { LaneColumn } from "../render/WordLaneView";
import type { Song } from "../song/song";
import { laneSong } from "../wordTyping/laneSong";
import type { GeneratedToken } from "../wordTyping/types";

interface Props {
  /** The line being typed, with its timing. */
  readonly song: Song;
  readonly tokens: readonly GeneratedToken[];
  /** Hands the lane to the trainer, which draws its frames into it; undefined takes it back. */
  readonly onAttach: (lane: WordLaneView | undefined) => void;
  /** The note the trainer waits for, the frame it changes; undefined while paused. */
  readonly onDue: (noteId: string | undefined) => void;
  /** The keyboard under the lane; its keys carry `data-code` and give the columns. */
  readonly keyboardRef: RefObject<HTMLElement | null>;
}

/** The piano lane's falling notes over the computer keys: each note drops onto its key. */
export function WordTypingLane({ song, tokens, onAttach, onDue, keyboardRef }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<WordLaneView>();

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const lane = new WordLaneView();
    let disposed = false;
    const mounted = lane.mount(host).then(() => {
      if (!disposed) setView(lane);
    });
    return () => {
      disposed = true;
      setView(undefined);
      void mounted.then(() => {
        lane.destroy();
      });
    };
  }, []);

  useEffect(() => {
    if (!view) return;
    onAttach(view);
    return () => {
      onAttach(undefined);
    };
  }, [view, onAttach]);

  useEffect(() => {
    if (!view) return;
    view.setOnDue(onDue);
    return () => {
      view.setOnDue(undefined);
    };
  }, [view, onDue]);

  const lane = useMemo(() => laneSong(song, tokens), [song, tokens]);
  useEffect(() => {
    view?.setSong(lane);
  }, [view, lane]);

  // A passive effect: the keyboard comes after the lane, so its ref is set only by now.
  useEffect(() => {
    const host = hostRef.current;
    const keyboard = keyboardRef.current;
    if (!view || !host || !keyboard) return;
    const measure = () => {
      const origin = host.getBoundingClientRect();
      const columns = new Map<string, LaneColumn>();
      for (const key of keyboard.querySelectorAll<HTMLElement>("[data-code]")) {
        const box = key.getBoundingClientRect();
        columns.set(key.dataset.code ?? "", { x: box.left - origin.left, width: box.width });
      }
      view.setColumns(columns);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    observer.observe(keyboard);
    return () => {
      observer.disconnect();
    };
  }, [view, keyboardRef]);

  return <div className="word-lane" ref={hostRef} aria-hidden="true" />;
}
