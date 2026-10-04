import { useEffect, useRef, useState } from "react";
import type { Finger, Hand } from "../fingering/fingering";
import { pitchLabel } from "../input/keyboardLayouts";
import type { NoteStatus } from "../practice/session";
import type { Song } from "../song/song";
import type { GeneratedToken, InputToken, WordTypingResult } from "../wordTyping/types";
import { inputTokenId } from "../wordTyping/inputTokens";
import { textProgress } from "../wordTyping/progress";
import { typingFinger } from "../wordTyping/touchTyping";
import type { WordLaneView } from "../render/WordLaneView";
import { WordTypingLane } from "./WordTypingLane";

/** The legend: the index fingers differ by hand, the others share a colour. */
const FINGERS: readonly (readonly [Hand, Finger, string])[] = [
  ["left", 5, "мизинцы"],
  ["left", 4, "безымянные"],
  ["left", 3, "средние"],
  ["left", 2, "левый указательный"],
  ["right", 2, "правый указательный"]
];
const ROWS = [
  [
    "Backquote",
    "Digit1",
    "Digit2",
    "Digit3",
    "Digit4",
    "Digit5",
    "Digit6",
    "Digit7",
    "Digit8",
    "Digit9",
    "Digit0",
    "Minus",
    "Equal"
  ],
  [
    "KeyQ",
    "KeyW",
    "KeyE",
    "KeyR",
    "KeyT",
    "KeyY",
    "KeyU",
    "KeyI",
    "KeyO",
    "KeyP",
    "BracketLeft",
    "BracketRight",
    "Backslash"
  ],
  ["KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ", "KeyK", "KeyL", "Semicolon", "Quote"],
  ["KeyZ", "KeyX", "KeyC", "KeyV", "KeyB", "KeyN", "KeyM", "Comma", "Period", "Slash"]
];
interface Props {
  readonly result: WordTypingResult | undefined;
  readonly statuses: Readonly<Record<string, NoteStatus | undefined>> | undefined;
  readonly time: number;
  readonly listening: boolean;
  readonly pending: boolean;
  readonly error: string | undefined;
  /** The line being typed, for the falling notes. */
  readonly song: Song;
  /** Hands the falling-notes lane to the trainer, which draws its frames there. */
  readonly attachLane: (lane: WordLaneView | undefined) => void;
  readonly onPress: (token: InputToken) => void;
  readonly onRelease: (token: InputToken) => void;
}

export function WordTypingBoard(props: Props) {
  const activeRef = useRef<HTMLSpanElement>(null);
  const keyboardRef = useRef<HTMLDivElement>(null);
  const { result, statuses } = props;
  const progress = textProgress(result?.tokens ?? [], statuses, props.time, props.listening);
  // The trainer's due note, every frame, lights the keys before the throttled snapshot catches up.
  const [dueId, setDueId] = useState<string>();
  const dueIndex = dueId ? (result?.tokens.findIndex((token) => token.noteId === dueId) ?? -1) : -1;
  const index = !props.listening && dueIndex >= 0 ? dueIndex : progress.index;
  const current = result?.tokens[index];
  // The note after it, lit dimmer in advance.
  const next = index >= 0 ? result?.tokens[index + 1] : undefined;
  const groups = new Map<number, GeneratedToken[]>();
  const inputs = new Map<string, InputToken>();
  for (const token of result?.tokens ?? []) {
    const group = groups.get(token.wordIndex) ?? [];
    group.push(token);
    groups.set(token.wordIndex, group);
    inputs.set(inputTokenId(token.input), token.input);
  }
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
          {result && (
            <WordTypingLane
              song={props.song}
              tokens={result.tokens}
              onAttach={props.attachLane}
              onDue={setDueId}
              keyboardRef={keyboardRef}
            />
          )}
          <div
            className="word-keyboard"
            ref={keyboardRef}
            aria-label="Автоматическая клавиатура мелодии"
          >
            {ROWS.map((row, rowIndex) => (
              <div className="word-keyboard__row" key={rowIndex}>
                {row.map((code) => {
                  const assigned = [...inputs.values()].filter(
                    (input) => input.physicalKey === code
                  );
                  const typing = typingFinger(code);
                  return (
                    <div
                      className={`word-keyboard__key${assigned.length === 0 ? " word-keyboard__key--empty" : typing ? ` word-finger-${typing.hand}-${String(typing.finger)}` : ""}`}
                      key={code}
                      data-code={code}
                    >
                      {assigned.length === 0 ? (
                        <span aria-hidden="true">·</span>
                      ) : (
                        assigned.map((token) => (
                          <button
                            type="button"
                            key={inputTokenId(token)}
                            className={
                              current && inputTokenId(current.input) === inputTokenId(token)
                                ? "word-keyboard__assigned word-keyboard__assigned--current"
                                : next && inputTokenId(next.input) === inputTokenId(token)
                                  ? "word-keyboard__assigned word-keyboard__assigned--next"
                                  : "word-keyboard__assigned"
                            }
                            aria-label={`${token.display}: ${pitchLabel(result?.tokenToPitch[inputTokenId(token)] ?? 0)}`}
                            onPointerDown={(event) => {
                              if (event.button !== 0) return;
                              event.preventDefault();
                              event.currentTarget.setPointerCapture(event.pointerId);
                              props.onPress(token);
                            }}
                            onPointerUp={() => {
                              props.onRelease(token);
                            }}
                            onPointerCancel={() => {
                              props.onRelease(token);
                            }}
                            onLostPointerCapture={() => {
                              props.onRelease(token);
                            }}
                          >
                            <span>{token.display.toUpperCase()}</span>
                            <small>
                              {pitchLabel(result?.tokenToPitch[inputTokenId(token)] ?? 0)}
                            </small>
                          </button>
                        ))
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <ul className="word-legend" aria-label="Цвета пальцев">
            {FINGERS.map(([hand, finger, name]) => (
              <li key={name} className={`word-finger-${hand}-${String(finger)}`}>
                {name}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
