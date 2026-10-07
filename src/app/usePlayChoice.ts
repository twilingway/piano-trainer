import { shallowEqual } from "react-redux";
import type { PartRole } from "../song/midiParts";
import { useRuntimeSelector } from "./PlayerRuntimeProvider";
import { useRuntimeCommand } from "./runtimeCommands";

const NO_ROLES: readonly PartRole[] = [];

/** Subscribe to displayed choices, not the freshly assembled commands in playChoice.parts. */
export function usePlayChoice() {
  const choice = useRuntimeSelector(
    (runtime) => ({
      hands: runtime.trainer.playChoice.hands,
      hasParts: runtime.trainer.playChoice.parts !== undefined,
      roles: runtime.trainer.playChoice.parts?.roles ?? NO_ROLES,
      role: runtime.trainer.playChoice.parts?.role ?? null,
      accompaniment: runtime.trainer.playChoice.parts?.accompaniment ?? false
    }),
    shallowEqual
  );
  const onHands = useRuntimeCommand((runtime) => runtime.trainer.playChoice.onHands);
  const onRole = useRuntimeCommand(
    (runtime) => (role: PartRole) => runtime.trainer.playChoice.parts?.onRole(role)
  );
  const onAccompaniment = useRuntimeCommand(
    (runtime) => (enabled: boolean) => runtime.trainer.playChoice.parts?.onAccompaniment(enabled)
  );
  return {
    hands: choice.hands,
    onHands,
    parts: choice.hasParts
      ? {
          roles: choice.roles,
          role: choice.role,
          accompaniment: choice.accompaniment,
          onRole,
          onAccompaniment
        }
      : undefined
  };
}
