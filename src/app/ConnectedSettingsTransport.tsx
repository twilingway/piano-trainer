import { shallowEqual } from "react-redux";
import { SettingsTransport } from "../ui/settings/SettingsTransport";
import { useRuntimeSelector } from "./PlayerRuntimeProvider";
import { useRuntimeCommand } from "./runtimeCommands";

export function ConnectedSettingsTransport() {
  const state = useRuntimeSelector(
    (runtime) => ({
      practiceActive: runtime.practiceActive,
      playing: runtime.playing,
      countdown: runtime.countdown,
      loading: runtime.sound === "loading",
      blocked:
        runtime.libraryOpen ||
        runtime.computerKeyboard.editing ||
        runtime.computerKeyboard.capturing ||
        runtime.timing.settingsProps.running ||
        (runtime.word.enabled && (runtime.word.pending || Boolean(runtime.word.error)))
    }),
    shallowEqual
  );
  const onToggle = useRuntimeCommand((runtime) => runtime.play);
  if (state.practiceActive) return null;
  return <SettingsTransport {...state} onToggle={onToggle} />;
}
