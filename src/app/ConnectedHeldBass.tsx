import { keyLabel } from "../input/keyboardLayouts";
import { HeldBassCourseCard, HeldBassPracticePanel } from "../ui/HeldBassCourse";
import { HeldBassIntro } from "../ui/HeldBassIntro";
import { useRuntimeSelector } from "./PlayerRuntimeProvider";

export function ConnectedHeldBassCard({ onChoose }: { onChoose: () => void }) {
  const course = useRuntimeSelector((runtime) => runtime.heldBass);
  return (
    <HeldBassCourseCard
      history={course.history}
      sourceFilter={course.sourceFilter}
      onSourceFilter={course.setSourceFilter}
      onIntro={() => {
        course.setIntro(true);
        onChoose();
      }}
      onStart={() => {
        course.start();
        onChoose();
      }}
    />
  );
}
export function ConnectedHeldBassPractice() {
  const course = useRuntimeSelector((runtime) => runtime.heldBass);
  const bindings = useRuntimeSelector((runtime) => runtime.computerKeyboard.bindings);
  return (
    <>
      {course.intro && (
        <HeldBassIntro
          bindings={Object.entries(bindings).flatMap(([code, binding]) =>
            binding.type === "note" ? [{ pitch: binding.pitch, label: keyLabel(code) }] : []
          )}
          onStart={course.start}
          onClose={() => {
            course.setIntro(false);
          }}
        />
      )}
      {course.active && (
        <HeldBassPracticePanel
          history={course.history}
          sourceFilter={course.sourceFilter}
          onSourceFilter={course.setSourceFilter}
          index={course.index}
          step={course.snapshot?.step ?? 0}
          melodyLength={course.fragment?.melodyPitches.length ?? 0}
          status={course.snapshot?.active ? course.snapshot.status : "unpresented"}
          ready={course.snapshot?.ready ?? false}
          hintLevel={course.hintLevel}
          pitches={
            course.snapshot?.targetPitch !== null &&
            course.snapshot?.targetPitch !== undefined &&
            course.fragment
              ? [course.fragment.bassPitch, course.snapshot.targetPitch]
              : []
          }
          renderError={course.renderError}
          preferences={course.preferences}
          result={course.result}
          onHint={course.hint}
          onRetry={course.onRetry}
          onNewSeries={course.newSeries}
          onExit={course.exit}
          onPreferences={course.updatePreferences}
        />
      )}
    </>
  );
}
