import { IntervalCourseCard, IntervalPracticePanel } from "../ui/IntervalCourse";
import { IntervalProgress } from "../ui/IntervalProgress";
import { useRuntimeSelector } from "./PlayerRuntimeProvider";

export function ConnectedIntervalCard({ onChoose }: { onChoose: () => void }) {
  const intervals = useRuntimeSelector((runtime) => runtime.intervals);
  return (
    <IntervalCourseCard
      onStart={(mode) => {
        intervals.start(mode);
        onChoose();
      }}
    />
  );
}

export function ConnectedIntervalPractice() {
  const intervals = useRuntimeSelector((runtime) => runtime.intervals);
  if (!intervals.active) return null;
  const { snapshot, audio } = intervals;
  return (
    <IntervalPracticePanel
      mode={intervals.mode}
      index={intervals.index}
      ready={snapshot?.canAnswer ?? false}
      completed={snapshot?.completed ?? false}
      listening={snapshot?.listening ?? false}
      paused={audio.paused}
      error={audio.error}
      renderError={intervals.renderError}
      helpShown={intervals.helpShown}
      onHelpPresented={intervals.onHelpPresented}
      fullListeningCount={snapshot?.fullListeningCount ?? 0}
      partialListeningCount={snapshot?.partialListeningCount ?? 0}
      errorCount={snapshot?.errorCount ?? 0}
      pair={intervals.pair}
      onAnswer={audio.answer}
      onListen={audio.listen}
      onPause={audio.togglePause}
      onHelp={intervals.hint}
      onRetry={intervals.onRetry}
      onStart={intervals.start}
      onNewSeries={intervals.newSeries}
      onExit={intervals.exit}
      progress={
        <IntervalProgress
          history={intervals.history}
          mode={intervals.mode}
          source={intervals.sourceFilter}
          onSource={intervals.setSourceFilter}
          result={intervals.result}
        />
      }
    />
  );
}
