import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { typingFinger } from "../wordTyping/touchTyping";
import type { GeneratedToken } from "../wordTyping/types";

/** Song seconds visible above the hit line. */
const LOOKAHEAD = 3;
/** A block never gets thinner than this, so a grace note stays visible. */
const MIN_HEIGHT = 6;

interface Column {
  readonly left: number;
  readonly width: number;
}

interface Layout {
  readonly columns: ReadonlyMap<string, Column>;
  readonly pxPerSecond: number;
}

interface Props {
  readonly tokens: readonly GeneratedToken[];
  /** Song seconds the view shows now, read every frame. */
  readonly liveTime: () => number;
  /** The keyboard under the lane; its keys carry `data-code` and give the columns. */
  readonly keyboardRef: RefObject<HTMLElement | null>;
}

/**
 * Notes fall into the column of their computer key. Blocks are laid out once by song time;
 * each frame only moves the track, so a frame writes one style and renders nothing.
 */
export function WordTypingLane({ tokens, liveTime, keyboardRef }: Props) {
  const laneRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<Layout>();

  // A passive effect: the keyboard comes after the lane, so its ref is set only by now.
  useEffect(() => {
    const lane = laneRef.current;
    const keyboard = keyboardRef.current;
    if (!lane || !keyboard) return;
    const measure = () => {
      const origin = lane.getBoundingClientRect();
      const columns = new Map<string, Column>();
      for (const key of keyboard.querySelectorAll<HTMLElement>("[data-code]")) {
        const box = key.getBoundingClientRect();
        columns.set(key.dataset.code ?? "", { left: box.left - origin.left, width: box.width });
      }
      setLayout({ columns, pxPerSecond: origin.height / LOOKAHEAD });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(lane);
    observer.observe(keyboard);
    return () => {
      observer.disconnect();
    };
  }, [keyboardRef]);

  useEffect(() => {
    if (!layout) return;
    let frame = 0;
    const step = () => {
      const track = trackRef.current;
      if (track) track.style.transform = `translateY(${String(liveTime() * layout.pxPerSecond)}px)`;
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [layout, liveTime]);

  return (
    <div className="word-lane" ref={laneRef} aria-hidden="true">
      <div className="word-lane__track" ref={trackRef}>
        {layout &&
          tokens.map((token) => {
            const column = layout.columns.get(token.input.physicalKey);
            if (!column) return null;
            const finger = typingFinger(token.input.physicalKey)?.finger;
            return (
              <span
                key={token.noteId}
                className={`word-lane__note${finger ? ` word-finger-${String(finger)}` : ""}`}
                style={{
                  left: column.left + column.width * 0.15,
                  width: column.width * 0.7,
                  bottom: token.start * layout.pxPerSecond,
                  height: Math.max(token.duration * layout.pxPerSecond, MIN_HEIGHT)
                }}
              >
                {token.input.display
                  .replace(/^Shift\+/, "⇧")
                  .replace(/^Alt\+/, "⌥")
                  .toUpperCase()}
              </span>
            );
          })}
      </div>
    </div>
  );
}
