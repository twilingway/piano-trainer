import { RhythmCourseCard, RhythmPanel } from "../ui/RhythmCourse";
import { RhythmProgress } from "../ui/RhythmProgress";
import { useRuntimeSelector } from "./PlayerRuntimeProvider";

export function ConnectedRhythmCard({ onChoose }: { onChoose: () => void }) {
  const rhythm = useRuntimeSelector((runtime) => runtime.rhythm);
  return (
    <RhythmCourseCard
      completedRuns={rhythm.history.length}
      onStart={() => {
        rhythm.start();
        onChoose();
      }}
    />
  );
}

export function ConnectedRhythmPractice() {
  const rhythm = useRuntimeSelector((runtime) => runtime.rhythm);
  const openSettings = useRuntimeSelector((runtime) => runtime.setSettingsOpen);
  if (!rhythm.active) return null;
  return (
    <RhythmPanel
      {...rhythm}
      onCalibrate={() => {
        openSettings(true);
      }}
      progress={<RhythmProgress history={rhythm.history} result={rhythm.result} />}
    />
  );
}
