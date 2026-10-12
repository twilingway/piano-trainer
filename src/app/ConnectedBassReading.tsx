import { BassReadingCourseCard, BassReadingPracticePanel } from "../ui/BassReadingCourse";
import { BassReadingIntro } from "../ui/BassReadingIntro";
import { keyLabel } from "../input/keyboardLayouts";
import { useRuntimeSelector } from "./PlayerRuntimeProvider";

export function ConnectedBassReadingCard({ onChoose }: { onChoose: () => void }) {
  const reading = useRuntimeSelector((runtime) => runtime.reading);
  return (
    <BassReadingCourseCard
      history={reading.bassHistory}
      sourceFilter={reading.bassSourceFilter}
      onSourceFilter={reading.setBassSourceFilter}
      onIntro={() => {
        reading.openBassIntro();
        onChoose();
      }}
      onStart={(task) => {
        reading.startBass(task);
        onChoose();
      }}
    />
  );
}

export function ConnectedBassReadingPractice() {
  const reading = useRuntimeSelector((runtime) => runtime.reading);
  const bindings = useRuntimeSelector((runtime) => runtime.computerKeyboard.bindings);
  return (
    <>
      {reading.intro && reading.introCourse === "bass" && (
        <BassReadingIntro
          keyBindings={Object.entries(bindings).flatMap(([code, binding]) =>
            binding.type === "note" ? [{ pitch: binding.pitch, label: keyLabel(code) }] : []
          )}
          onStart={() => {
            reading.startBass("notes");
          }}
          onClose={() => {
            reading.setIntro(false);
          }}
        />
      )}
      {reading.isBass && reading.task && reading.task !== "check" && (
        <BassReadingPracticePanel
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
          result={reading.bassResult}
          history={reading.bassHistory}
          ready={Boolean(reading.snapshot?.active && reading.snapshot.presented)}
          sourceFilter={reading.bassSourceFilter}
          onSourceFilter={reading.setBassSourceFilter}
        />
      )}
    </>
  );
}
