import { useAppSelector } from "./storeHooks";
import { useRuntimeCommand } from "./runtimeCommands";
import { ConnectedPlayerHeader } from "./ConnectedPlayerHeader";
import { ConnectedNotices } from "./ConnectedPlayerNotices";
import { ConnectedReview } from "./ConnectedPlayerReview";
import { ConnectedPracticeWorkspace } from "./ConnectedPracticeWorkspace";
import { ConnectedPlayerWindows } from "./ConnectedPlayerWindows";
export function PlayerScreen() {
  const enabled = useAppSelector((state) => state.preferences.word.enabled);
  const onClickCapture = useRuntimeCommand((runtime) => runtime.fullscreen.onClickCapture);
  return (
    <div className={`app${enabled ? " app--word" : ""}`} onClickCapture={onClickCapture}>
      <ConnectedPlayerHeader />
      <ConnectedNotices />
      <ConnectedReview />
      <ConnectedPracticeWorkspace />
      <ConnectedPlayerWindows />
    </div>
  );
}
