import { useLayoutEffect, useMemo, useRef } from "react";
import type { Finger, Hand } from "../fingering/fingering";
import type { NoteStatus } from "../practice/session";
import type { GeneratedToken, WordTypingResult } from "../wordTyping/types";
import { textProgress } from "../wordTyping/progress";

/** The legend: the index fingers differ by hand, the others share a colour. */
const FINGERS: readonly (readonly [Hand, Finger, string, string])[] = [
  ["left", 5, "мизинцы", "миз"],
  ["left", 4, "безымянные", "без"],
  ["left", 3, "средние", "ср"],
  ["left", 2, "левый указательный", "Л"],
  ["right", 2, "правый указательный", "П"]
];
interface Props {
  readonly result: WordTypingResult | undefined;
  readonly statuses: Readonly<Record<string, NoteStatus | undefined>> | undefined;
  readonly time: number;
  readonly listening: boolean;
  readonly pending: boolean;
  readonly error: string | undefined;
  /** A note about the text, such as a variant that came out the same. */
  readonly notice?: string | undefined;
}
const EMPTY_TOKENS: readonly GeneratedToken[] = [];

/** Grouping depends only on the generated text, independent of playback progress. */
function groupTokens(
  tokens: readonly GeneratedToken[]
): ReadonlyMap<number, readonly GeneratedToken[]> {
  const groups = new Map<number, GeneratedToken[]>();
  for (const token of tokens) {
    const group = groups.get(token.wordIndex) ?? [];
    group.push(token);
    groups.set(token.wordIndex, group);
  }
  return groups;
}

/** The typed text as a running line: the current character stays in the middle, as on the staff. */
export function WordTicker(props: Props) {
  const lineRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const { result, statuses } = props;
  const tokens = result?.tokens ?? EMPTY_TOKENS;
  const progress = textProgress(tokens, statuses, props.time, props.listening);
  const { index } = progress;
  // Past the end, the line stays on the last character.
  const anchor = index >= 0 ? index : (tokens.at(-1)?.noteIndex ?? -1);
  const groups = useMemo(() => groupTokens(tokens), [tokens]);
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
    // A larger or smaller text moves the current character: centre it again.
    observer.observe(track);
    return () => {
      observer.disconnect();
    };
  }, [anchor, result, props.pending, props.error]);
  if (props.pending || props.error || !result) return null;
  return (
    <>
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
      {/* A computer keeps the legend under the line, over the keys it colours. */}
      <FingerLegend className="word-legend--ticker" />
    </>
  );
}

/** How good the generated text is: not a mark for the playing. */
export function WordQuality({ metrics }: { metrics: WordTypingResult["metrics"] | undefined }) {
  if (!metrics) return null;
  return (
    <span className="word-quality" title="Качество генерации текста, а не оценка исполнения">
      {"★".repeat(metrics.stars)}
      {"☆".repeat(5 - metrics.stars)}{" "}
      <small>{Math.round(metrics.dictionaryCoveragePercent)}% нот в словах</small>
    </span>
  );
}

/** Which finger a key's colour means; a computer shows it under the running line. */
export function FingerLegend({ className }: { readonly className?: string }) {
  return (
    <ul className={`word-legend${className ? ` ${className}` : ""}`} aria-label="Цвета пальцев">
      {FINGERS.map(([hand, finger, name, short]) => (
        <li key={name} className={`word-finger-${hand}-${String(finger)}`} title={name}>
          <span className="word-legend__full">{name}</span>
          {/* A phone's legend fits one line with these. */}
          <span className="word-legend__short" aria-hidden="true">
            {short}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The legend and the text's quality on a phone, the words' progress and errors everywhere. */
export function WordTypingBoard(props: Props) {
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
            <FingerLegend />
            {props.notice && <small role="status">{props.notice}</small>}
            <WordQuality metrics={props.result?.metrics} />
          </div>
        </>
      )}
    </section>
  );
}
