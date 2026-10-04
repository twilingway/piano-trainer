import { useEffect, useRef } from "react";
import { pitchLabel } from "../input/keyboardLayouts";
import type { NoteStatus } from "../practice/session";
import type { GeneratedToken, InputToken, WordTypingResult } from "../wordTyping/types";
import { inputTokenId } from "../wordTyping/inputTokens";
import { textProgress } from "../wordTyping/progress";
import { typingFinger } from "../wordTyping/touchTyping";
import { WordTypingLane } from "./WordTypingLane";

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
  readonly playing: boolean;
  readonly listening: boolean;
  readonly pending: boolean;
  readonly error: string | undefined;
  readonly discardedNotes: number;
  readonly runtimeMs: number | undefined;
  /** Song seconds the view shows now, for the falling notes. */
  readonly liveTime: () => number;
  readonly onPress: (token: InputToken) => void;
  readonly onRelease: (token: InputToken) => void;
}

export function WordTypingBoard(props: Props) {
  const activeRef = useRef<HTMLSpanElement>(null);
  const keyboardRef = useRef<HTMLDivElement>(null);
  const { result, statuses } = props;
  const progress = textProgress(result?.tokens ?? [], statuses, props.time, props.listening);
  const { index, holding, holdProgress } = progress;
  const current = result?.tokens[index];
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
  const metrics = result?.metrics;
  return (
    <section className="word-board" aria-label="Печатать мелодию">
      <div className="word-board__heading">
        <div>
          <span className="word-eyebrow">ПЕЧАТАТЬ МЕЛОДИЮ · ПРОТОТИП</span>
          <h1>Слова становятся музыкой</h1>
        </div>
        {metrics && (
          <div className="word-quality" title="Качество генерации текста, а не оценка исполнения">
            {"★".repeat(metrics.stars)}
            {"☆".repeat(5 - metrics.stars)}
            <small>{Math.round(metrics.dictionaryCoveragePercent)}% нот в словах</small>
          </div>
        )}
      </div>
      <p className="word-board__help">
        Печатайте выделенную букву и удерживайте клавишу указанное время. Пробелы нажимать не нужно.
        Раскладка автоматически построена для всей партии.
      </p>
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
          <div className="word-next" aria-live="polite">
            <strong>
              {current
                ? `${current.input.display.toUpperCase()} → ${pitchLabel(current.pitch)}`
                : result
                  ? "Партия завершена"
                  : ""}
            </strong>
            <span>
              {holding
                ? `Удерживайте ${holding.input.display.toUpperCase()} · ${holding.duration.toFixed(2)} с в песне`
                : current
                  ? `Удержание ${current.duration.toFixed(2)} с в песне`
                  : ""}
            </span>
            <span>
              {result?.tokens.length
                ? `${String(index < 0 ? result.tokens.length : index)} / ${String(result.tokens.length)} нот`
                : ""}
            </span>
            <progress aria-label="Удержание текущей ноты" max={1} value={holdProgress} />
          </div>
          {result && (
            <WordTypingLane
              tokens={result.tokens}
              liveTime={props.liveTime}
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
                  const finger = typingFinger(code)?.finger;
                  return (
                    <div
                      className={`word-keyboard__key${assigned.length === 0 ? " word-keyboard__key--empty" : finger ? ` word-finger-${String(finger)}` : ""}`}
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
          <p className="word-board__foot">
            {props.discardedNotes > 0
              ? `Из одновременных нот выбрана одна линия; исключено атак: ${String(props.discardedNotes)}. `
              : ""}
            Настройки обычной клавиатуры здесь не применяются.{" "}
            {props.runtimeMs !== undefined
              ? `Подбор: ${(props.runtimeMs / 1000).toFixed(2)} с.`
              : ""}{" "}
            {props.playing ? "Ctrl+Пробел — пауза." : "Нажмите «Играть», чтобы начать."}
          </p>
        </>
      )}
    </section>
  );
}
