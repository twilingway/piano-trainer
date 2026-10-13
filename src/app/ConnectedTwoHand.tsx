import { keyLabel } from "../input/keyboardLayouts";
import { TwoHandCourseCard, TwoHandPracticePanel } from "../ui/TwoHandCourse";
import { TwoHandIntro } from "../ui/TwoHandIntro";
import { useRuntimeSelector } from "./PlayerRuntimeProvider";

export function ConnectedTwoHandCard({ onChoose }: { onChoose: () => void }) {
  const course = useRuntimeSelector((runtime) => runtime.twoHand);
  return (
    <TwoHandCourseCard
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
export function ConnectedTwoHandPractice() {
  const course = useRuntimeSelector((runtime) => runtime.twoHand);
  const bindings = useRuntimeSelector((runtime) => runtime.computerKeyboard.bindings);
  return (
    <>
      {course.intro && (
        <TwoHandIntro
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
        <TwoHandPracticePanel
          history={course.history}
          sourceFilter={course.sourceFilter}
          onSourceFilter={course.setSourceFilter}
          index={course.index}
          status={course.snapshot?.status ?? "unpresented"}
          ready={Boolean(course.snapshot?.active && course.snapshot.presented)}
          hintLevel={course.hintLevel}
          pitches={course.pair?.pitches ?? []}
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
