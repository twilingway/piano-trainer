import { createContext, useContext, type ReactNode } from "react";
import { useI18n } from "../app/useI18n";

export interface LessonWindowControls {
  readonly open: string | null;
  readonly onOpen: (id: string | null) => void;
  readonly interruptsAttempt: boolean;
}
export const LessonWindowContext = createContext<LessonWindowControls | null>(null);

interface Props {
  readonly title: string;
  readonly instruction: string;
  readonly input: string;
  readonly score: ReactNode;
  readonly action: ReactNode;
  readonly windows: LessonWindowControls;
  readonly children: ReactNode;
}

/** The score keeps one owner; controls and references only occupy adjacent slots. */
export function LessonWorkspace(props: Props) {
  const { t } = useI18n();
  return (
    <LessonWindowContext value={props.windows}>
      <section className="lesson-workspace" aria-label={props.title}>
        <header className="lesson-workspace__heading">
          <h2>{props.title}</h2>
          <p>{props.instruction}</p>
        </header>
        <div className="lesson-workspace__score">{props.score}</div>
        <div className="lesson-workspace__response">
          {props.action}
          <p className="lesson-workspace__input">{props.input}</p>
        </div>
        <div className="lesson-workspace__controls" aria-label={t("Управление уроком")}>
          {props.children}
        </div>
      </section>
    </LessonWindowContext>
  );
}

export function useLessonWindow() {
  return useContext(LessonWindowContext);
}
