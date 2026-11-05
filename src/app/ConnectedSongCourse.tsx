import type { ReactNode } from "react";
import { useI18n } from "./useI18n";
import { setInterfaceLanguage } from "./interfaceLanguage";
import { useRuntimeCommand } from "./runtimeCommands";
import { ConnectedSongCourseCharacters } from "./ConnectedSongCourseCharacters";
import { SongCourseLesson } from "../ui/SongCourseLesson";
import { useRuntimeSelector } from "./PlayerRuntimeProvider";

export function ConnectedSongCourse({ score }: { readonly score: ReactNode }) {
  const course = useRuntimeSelector((runtime) => runtime.songCourse);
  const navigation = useRuntimeSelector((runtime) => runtime.libraryNavigation);
  const { locale } = useI18n();
  const setSettingsOpen = useRuntimeCommand((runtime) => runtime.setSettingsOpen);
  const endEditing = useRuntimeCommand((runtime) => runtime.computerKeyboard.endEditing);
  const fullscreen = useRuntimeCommand((runtime) => runtime.fullscreen.toggle);
  const { controller, view } = course;
  if (!view.material) return null;
  return (
    <SongCourseLesson
      material={view.material}
      phase={view.phase}
      progress={view.progress}
      countdown={view.countdown}
      result={view.result}
      error={view.error}
      storageError={course.storageError}
      hasNext={course.hasNext}
      canReview={course.canReview}
      score={score}
      characters={<ConnectedSongCourseCharacters />}
      onSettings={() => {
        endEditing();
        setSettingsOpen(true);
      }}
      onLanguage={() => {
        setInterfaceLanguage(locale === "ru" ? "en" : "ru");
      }}
      onFullscreen={() => void fullscreen()}
      waiting={view.waiting}
      speed={course.options?.speed ?? 1}
      onSpeed={(value: number) => {
        controller.setSpeed(value);
      }}
      onStart={() => {
        void controller.start();
      }}
      onDemo={() => {
        void controller.demo();
      }}
      onPause={controller.pause}
      onRetry={controller.retry}
      onNext={controller.next}
      onReview={controller.review}
      onRetrySave={controller.retrySave}
      onExit={() => {
        controller.exit();
        navigation.open("lessons");
      }}
    />
  );
}
