import { ReadingCourseCard, ReadingPracticePanel } from "../ui/ReadingCourse";
import { ReadingIntro } from "../ui/ReadingIntro";
import { useRuntimeSelector } from "./PlayerRuntimeProvider";
import { useEffect } from "react";

export function ConnectedReadingCard({ onChoose }: { onChoose: () => void }) {
  const reading = useRuntimeSelector((runtime) => runtime.reading);
  const refreshClock = reading.refreshClock;
  useEffect(() => {
    refreshClock();
  }, [refreshClock]);
  return (
    <ReadingCourseCard
      history={reading.history}
      profile={reading.profile}
      sourceFilter={reading.sourceFilter}
      onSourceFilter={reading.setSourceFilter}
      onAdaptive={() => {
        void reading.startAdaptive().then((selected) => {
          if (selected) onChoose();
        });
      }}
      onDelayedCheck={() => {
        void reading.startDelayed().then((selected) => {
          if (selected) onChoose();
        });
      }}
      delayedDue={reading.delayedDue}
      generationError={reading.generationError}
      onGenerationRetry={reading.retryGeneration}
      onIntro={() => {
        reading.setIntro(true);
        onChoose();
      }}
      onStart={(task) => {
        void reading.start(task).then((selected) => {
          if (selected) onChoose();
        });
      }}
    />
  );
}
export function ConnectedReadingPractice({
  mode = "all"
}: {
  mode?: "all" | "intro" | "practice";
}) {
  const reading = useRuntimeSelector((runtime) => runtime.reading);
  return (
    <>
      {mode !== "practice" && reading.intro && reading.introCourse !== "bass" && (
        <ReadingIntro
          onStart={() => {
            reading.setIntro(false);
            void reading.start("notes");
          }}
          onClose={() => {
            reading.setIntro(false);
          }}
        />
      )}
      {mode !== "intro" && reading.task && !reading.isBass && (
        <ReadingPracticePanel
          task={reading.task}
          purpose={reading.purpose ?? reading.task}
          profile={reading.profile}
          sourceFilter={reading.sourceFilter}
          onSourceFilter={reading.setSourceFilter}
          onAdaptive={() => {
            void reading.startAdaptive();
          }}
          onDelayedCheck={() => {
            void reading.startDelayed();
          }}
          delayedDue={reading.delayedDue}
          generationError={reading.generationError}
          onGenerationRetry={reading.retryGeneration}
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
