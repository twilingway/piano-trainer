import { useLayoutEffect, useRef } from "react";
import type { Finger, Hand } from "../fingering/fingering";
import type { NoteStatus } from "../practice/session";
import type { GeneratedToken, WordTypingResult } from "../wordTyping/types";
import { textProgress } from "../wordTyping/progress";

/** The legend: the index fingers differ by hand, the others share a colour. */
const FINGERS: readonly (readonly [Hand, Finger, string])[] = [
  ["left", 5, "мизинцы"],
  ["left", 4, "безымянные"],
  ["left", 3, "средние"],
  ["left", 2, "левый указательный"],
  ["right", 2, "правый указательный"]
];
interface Props {
  readonly result: WordTypingResult | undefined;
  readonly statuses: Readonly<Record<string, NoteStatus | undefined>> | undefined;
  readonly time: number;
  readonly listening: boolean;
  readonly pending: boolean;
  readonly error: string | undefined;
}

/** The typed text as a running line: the current character stays in the middle, as on the staff. */
export function WordTicker(props: Props) {
  const lineRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const { result, statuses } = props;
  const tokens = result?.tokens ?? [];
  const progress = textProgress(tokens, statuses, props.time, props.listening);
  const { index } = progress;
  // Past the end, the line stays on the last character.
  const anchor = index >= 0 ? index : (tokens.at(-1)?.noteIndex ?? -1);
  const groups = new Map<number, GeneratedToken[]>();
  for (const token of tokens) {
    const group = groups.get(token.wordIndex) ?? [];
    group.push(token);
    groups.set(token.wordIndex, group);
  }
  useLayoutEffect(() => {
    const line = lineRef.current;
    const track = trackRef.current;
    if (!line || !track) return;
    const center = () => {
      const mark = anchorRef.current;
      const x = mark ? mark.offsetLeft + mark.offsetWidth / 2 : 0;
      track.style.transform = `translateX(${String(line.clientWidth / 2 - x)}px)`;
    };
    center();
    const observer = new ResizeObserver(center);
    observer.observe(line);
    return () => {
      observer.disconnect();
    };
  }, [anchor, result, props.pending, props.error]);
  if (props.pending || props.error || !result) return null;
  return (
    <div className="word-ticker" ref={lineRef} aria-label="Текст мелодии">
      <div className="word-ticker__track" ref={trackRef}>
        {[...groups].map(([groupIndex, word]) => (
          <span className="word-text__word" key={groupIndex}>
            {word.map((token) => {
              const active = token.noteIndex === index;
              const status = progress.statuses[token.noteIndex] ?? "pending";
              return (
                <span
                  key={token.noteId}
                  ref={token.noteIndex === anchor ? anchorRef : undefined}
                  className={`word-character word-character--${status}${active ? " word-character--current" : ""}${token.isFallback ? " word-character--fallback" : ""}`}
                  aria-current={active ? "step" : undefined}
                >
                  {token.isFallback
                    ? `[${token.input.display}]`
                    : token.input.display.toLowerCase()}
                </span>
              );
            })}
          </span>
        ))}
      </div>
    </div>
  );
}

/** The legend and the text's quality; the text itself is the ticker's. */
export function WordTypingBoard(props: Props) {
  const metrics = props.result?.metrics;
  return (
    <section className="word-board" aria-label="Печатать мелодию">
      {props.pending ? (
        <p role="status">Подбираю слова и клавиши для мелодии…</p>
      ) : props.error ? (
        <p className="toast--error" role="alert">
          {props.error}
        </p>
      ) : (
        <>
          <div className="word-board__info">
            <ul className="word-legend" aria-label="Цвета пальцев">
              {FINGERS.map(([hand, finger, name]) => (
                <li key={name} className={`word-finger-${hand}-${String(finger)}`}>
                  {name}
                </li>
              ))}
            </ul>
            {metrics && (
              <span
                className="word-quality"
                title="Качество генерации текста, а не оценка исполнения"
              >
                {"★".repeat(metrics.stars)}
                {"☆".repeat(5 - metrics.stars)}{" "}
                <small>{Math.round(metrics.dictionaryCoveragePercent)}% нот в словах</small>
              </span>
            )}
          </div>
        </>
      )}
    </section>
  );
}
