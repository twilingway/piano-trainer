import { useCallback, useRef, useState, type RefObject } from "react";
import type { Trainer } from "../practice/Trainer";
import { graphicsFailureKind, type GraphicsFailureKind } from "../render/graphicsFailure";

export function useGraphicsAvailability(trainerRef: RefObject<Trainer | null>) {
  const availableRef = useRef(true);
  const available = useCallback(() => availableRef.current, []);
  const [generation, setGeneration] = useState(0);
  const [notice, setNotice] = useState<{ kind: GraphicsFailureKind | null; open: boolean }>({
    kind: null,
    open: false
  });
  const fail = useCallback((error: unknown) => {
    availableRef.current = false;
    setNotice({ kind: graphicsFailureKind(error), open: true });
  }, []);
  const retry = useCallback(() => {
    availableRef.current = true;
    setNotice({ kind: null, open: false });
    setGeneration((value) => value + 1);
  }, []);
  const dismiss = useCallback(() => {
    setNotice((previous) => ({ ...previous, open: false }));
  }, []);
  const show = useCallback(() => {
    setNotice((previous) => ({ ...previous, open: true }));
  }, []);
  const blocked = () => {
    if (!notice.kind) return false;
    show();
    return true;
  };
  const attach = useCallback(
    (host: HTMLDivElement) => {
      const lost = (event: Event) => {
        event.preventDefault();
        availableRef.current = false;
        trainerRef.current?.setGraphicsAvailable(false);
        setNotice({ kind: "lost", open: true });
      };
      const restored = () => {
        availableRef.current = true;
        trainerRef.current?.setGraphicsAvailable(true);
        setNotice({ kind: null, open: false });
      };
      host.addEventListener("webglcontextlost", lost, true);
      host.addEventListener("webglcontextrestored", restored, true);
      return () => {
        host.removeEventListener("webglcontextlost", lost, true);
        host.removeEventListener("webglcontextrestored", restored, true);
      };
    },
    [trainerRef]
  );
  return {
    generation,
    failure: notice.kind,
    open: notice.open,
    fail,
    retry,
    dismiss,
    show,
    blocked,
    attach,
    available
  };
}
