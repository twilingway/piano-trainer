import type { ReactNode } from "react";
import type { Language, WordTypingResult } from "../wordTyping/types";
import { BarPopover } from "./BarPopover";
import { WordQuality } from "./WordTypingBoard";

interface Props {
  /** The text's settings, the same the phone's menu holds. */
  readonly settings: ReactNode;
  readonly language: Language;
  readonly metrics: WordTypingResult["metrics"] | undefined;
  /** A note about the text, such as a variant that came out the same. */
  readonly notice: string | undefined;
}

/** The word mode's settings and the text's quality behind one button of the bar. */
export function WordTextPopover(props: Props) {
  return (
    <BarPopover
      className="word-text-popover"
      label="Текст: язык, партия, раскладка и качество"
      summary={
        <>
          Текст{" "}
          <small className="word-text-popover__language">{props.language.toUpperCase()}</small>
          <span aria-hidden="true">▾</span>
        </>
      }
    >
      {props.settings}
      {props.metrics && (
        <p className="word-text-popover__quality">
          <span>Качество текста</span>
          <WordQuality metrics={props.metrics} />
        </p>
      )}
      {props.notice && <small role="status">{props.notice}</small>}
    </BarPopover>
  );
}
