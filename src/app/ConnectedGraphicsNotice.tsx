import { shallowEqual } from "react-redux";
import { GraphicsNotice } from "../ui/GraphicsNotice";
import { useRuntimeSelector } from "./PlayerRuntimeProvider";

export function ConnectedGraphicsNotice() {
  const graphics = useRuntimeSelector((runtime) => runtime.trainer.graphics, shallowEqual);
  if (!graphics.failure) return null;
  return (
    <GraphicsNotice
      failure={graphics.failure}
      open={graphics.open}
      onClose={graphics.dismiss}
      onRetry={graphics.retry}
      onShow={graphics.show}
    />
  );
}
