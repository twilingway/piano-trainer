import { useEffect, useRef } from "react";
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
  /** A note about the text, such as a variant that came out the same. */
  readonly notice?: string | undefined;
}

export function WordTypingBoard(props: Props) {
  const activeRef = useRef<HTMLSpanElement>(null);
  const { result, statuses } = props;
  const progress = textProgress(result?.tokens ?? [], statuses, props.time, props.listening);
  const { index } = progress;
  const groups = new Map<number, GeneratedToken[]>();
  for (const token of result?.tokens ?? []) {
    const group = groups.get(token.wordIndex) ?? [];
    group.push(token);
    groups.set(token.wordIndex, group);
  }
  const metrics = result?.metrics;
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [index, result]);
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
          <div className="word-text" aria-label="Текст мелодии">
            {[...groups].map(([groupIndex, tokens]) => (
              <span className="word-text__word" key={groupIndex}>
                {tokens.map((token) => {
                  const active = token.noteIndex === index;
                  const status = progress.statuses[token.noteIndex] ?? "pending";
                  return (
                    <span
                      key={token.noteId}
                      ref={active ? activeRef : undefined}
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
          <div className="word-board__info">
            <ul className="word-legend" aria-label="Цвета пальцев">
              {FINGERS.map(([hand, finger, name]) => (
                <li key={name} className={`word-finger-${hand}-${String(finger)}`}>
                  {name}
                </li>
              ))}
            </ul>
            {props.notice && <small role="status">{props.notice}</small>}
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
