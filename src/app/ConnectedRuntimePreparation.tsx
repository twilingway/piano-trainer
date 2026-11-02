import { shallowEqual } from "react-redux";
import { RuntimePreparation } from "../ui/RuntimePreparation";
import { useRuntimeSelector } from "./PlayerRuntimeProvider";
import { useRuntimeCommand } from "./runtimeCommands";

export function ConnectedRuntimePreparation() {
  const state = useRuntimeSelector(
    (runtime) => ({
      party: runtime.trainer.preparation.status,
      audioForeground: runtime.audioPreparation.foreground,
      sound: runtime.sound,
      progress: runtime.audioPreparation.progress
    }),
    shallowEqual
  );
  const onCancel = useRuntimeCommand((runtime) => runtime.cancelPreparation);
  const onRetry = useRuntimeCommand((runtime) => () => {
    if (runtime.trainer.preparation.status === "error") {
      void runtime.audioPreparation.prepare();
      runtime.trainer.preparation.retry();
    } else runtime.audioPreparation.retry();
  });
  return <RuntimePreparation {...state} onCancel={onCancel} onRetry={onRetry} />;
}
