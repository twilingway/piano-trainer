import { useRuntimeSelector } from "./PlayerRuntimeProvider";
import { BeginnerIntro, BeginnerPracticePanel } from "../ui/BeginnerCourse";
export function ConnectedBeginner({ intro = false }: { readonly intro?: boolean }) {
  const beginner = useRuntimeSelector((r) => r.beginner);
  const reading = useRuntimeSelector((r) => r.reading);
  if (!beginner.selection) return null;
  if (intro)
    return beginner.intro ? (
      <BeginnerIntro
        selection={beginner.selection}
        onStart={beginner.guided}
        onClose={beginner.exit}
      />
    ) : null;
  if (beginner.intro) return null;
  return (
    <BeginnerPracticePanel
      selection={beginner.selection}
      answers={reading.snapshot?.answers ?? []}
      pitch={reading.note?.pitch}
      helped={reading.hintLevel > 0}
      ready={!!reading.snapshot?.active && reading.snapshot.presented}
      completed={!!reading.result}
      renderError={reading.renderError}
      storageError={beginner.error}
      onRetry={reading.onRetry}
      onRetrySave={beginner.retrySave}
      onHint={reading.hint}
      onRepeat={beginner.repeat}
      onExit={beginner.exit}
      onIndependent={beginner.independentStart}
      onNext={beginner.next}
    />
  );
}
