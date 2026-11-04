import { useState } from "react";
import { useRuntimeSelector, useRuntimeSource } from "./PlayerRuntimeProvider";
import { GuidedLessonPath } from "../ui/GuidedLessonPath";
import type { PathStep } from "../learningPath/model";
import { useGuidedProgress } from "./GuidedProgressProvider";
export function ConnectedGuidedPath({ onChoose }: { readonly onChoose: () => void }) {
  const source = useRuntimeSource();
  const progress = useGuidedProgress();
  const beginner = useRuntimeSelector((r) => r.beginner);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const choose = async (step: PathStep) => {
    const r = source.getSnapshot();
    const c = step.command;
    setPending(true);
    setFailed(false);
    try {
      if (c.kind === "beginner") r.beginner.start(c.stageId);
      else if (c.kind === "reading") {
        if (!(await r.reading.start(c.task))) {
          setFailed(true);
          return;
        }
      } else if (c.kind === "intro") {
        if (c.hand === "right") r.reading.setIntro(true);
        else r.reading.openBassIntro();
      } else if (c.kind === "bass") r.reading.startBass(c.task);
      else if (c.kind === "interval") r.intervals.start(c.mode);
      else if (c.kind === "rhythm") r.rhythm.start();
      else if (c.kind === "two-hand") r.twoHand.start();
      else if (c.kind === "held-bass") r.heldBass.start();
      else if (c.kind === "two-rhythms") r.independentRhythm.start();
      else r.music.open(c.course);
      onChoose();
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  };
  return (
    <GuidedLessonPath
      completed={[...progress.completed, ...beginner.completed]}
      pending={pending}
      error={
        failed
          ? "Не удалось подготовить шаг. Нажмите на него, чтобы попробовать снова."
          : progress.error
            ? "Не удалось сохранить шаги. Проверьте доступ браузера к хранилищу."
            : null
      }
      onChoose={(step) => {
        void choose(step);
      }}
    />
  );
}
