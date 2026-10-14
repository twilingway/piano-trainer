import { keyLabel } from "../input/keyboardLayouts";
import {
  IndependentRhythmCourseCard,
  IndependentRhythmPracticePanel
} from "../ui/IndependentRhythmCourse";
import { IndependentRhythmIntro } from "../ui/IndependentRhythmIntro";
import { useRuntimeSelector } from "./PlayerRuntimeProvider";

export function ConnectedIndependentRhythmCard({ onChoose }: { onChoose: () => void }) {
  const course = useRuntimeSelector((runtime) => runtime.independentRhythm);
  return (
    <IndependentRhythmCourseCard
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

export function ConnectedIndependentRhythmPractice() {
  const course = useRuntimeSelector((runtime) => runtime.independentRhythm);
  const savedBindings = useRuntimeSelector((runtime) => runtime.computerKeyboard.bindings);
  if (!course.active && !course.intro) return null;
  const bindings = Object.entries(savedBindings).flatMap(([code, binding]) =>
    binding.type === "note" ? [{ pitch: binding.pitch, label: keyLabel(code) }] : []
  );
  return (
    <>
      {course.intro && (
        <IndependentRhythmIntro
          bindings={bindings}
          onStart={course.start}
          onClose={() => {
            course.setIntro(false);
          }}
        />
      )}
      {course.active && (
        <IndependentRhythmPracticePanel
          {...course}
          bindings={bindings}
          onSource={course.setSource}
          onSourceFilter={course.setSourceFilter}
          onShowKeyHints={course.setShowKeyHints}
          onNewSeries={course.newSeries}
          onExit={course.exit}
        />
      )}
    </>
  );
}
