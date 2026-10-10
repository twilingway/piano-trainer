import { ReadingCourseCard, ReadingIntro, ReadingPracticePanel } from "../ui/ReadingCourse";
import { useRuntimeSelector } from "./PlayerRuntimeProvider";

export function ConnectedReadingCard({ onChoose }: { onChoose: () => void }) {
  const reading = useRuntimeSelector((runtime) => runtime.reading);
  return (
    <ReadingCourseCard
      history={reading.history}
      onIntro={() => {
        reading.setIntro(true);
        onChoose();
      }}
      onStart={(task) => {
        reading.start(task);
        onChoose();
      }}
    />
  );
}
export function ConnectedReadingPractice() {
  const reading = useRuntimeSelector((runtime) => runtime.reading);
  return (
    <>
      {reading.intro && (
        <ReadingIntro
          onClose={() => {
            reading.setIntro(false);
          }}
        />
      )}
      {reading.task && (
        <ReadingPracticePanel
          task={reading.task}
          preferences={reading.preferences}
          onPreferences={reading.updatePreferences}
          onHint={reading.hint}
          hintLevel={reading.hintLevel}
          hintPitch={reading.note?.pitch}
          index={reading.index}
          renderError={reading.renderError}
          onRetry={reading.onRetry}
          onNewSeries={reading.newSeries}
          onExit={reading.exit}
          result={reading.result}
          history={reading.history}
          ready={Boolean(reading.snapshot?.active && reading.snapshot.presented)}
        />
      )}
    </>
  );
}
