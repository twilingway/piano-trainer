import { useRuntimeCommand } from "./runtimeCommands";
import { ReviewBar } from "../ui/ReviewBar";
import { useRuntimeSelector } from "./PlayerRuntimeProvider";

import { shallowEqual } from "react-redux";
export function ConnectedReview() {
  const { review, lastTake, comparing, takesTakes, takesSplitDirection, takesTakeStaff } =
    useRuntimeSelector(
      (runtime) => ({
        review: runtime.review,
        lastTake: runtime.lastTake,
        comparing: runtime.comparing,
        takesTakes: runtime.takes.takes,
        takesSplitDirection: runtime.takes.splitDirection,
        takesTakeStaff: runtime.takes.takeStaff
      }),
      shallowEqual
    );
  const takesSelectTake = useRuntimeCommand((runtime) => runtime.takes.selectTake);
  const takesSetSplitDirection = useRuntimeCommand((runtime) => runtime.takes.setSplitDirection);
  const takesStartComparing = useRuntimeCommand((runtime) => runtime.takes.startComparing);
  const takesSetComparing = useRuntimeCommand((runtime) => runtime.takes.setComparing);
  const takesSetTakeStaff = useRuntimeCommand((runtime) => runtime.takes.setTakeStaff);
  const takesDownloadLastTake = useRuntimeCommand((runtime) => runtime.takes.downloadLastTake);
  const takesHideReview = useRuntimeCommand((runtime) => runtime.takes.hideReview);
  return (
    <>
      {review && lastTake && (
        <ReviewBar
          review={review}
          take={lastTake.take}
          takes={takesTakes}
          comparing={comparing}
          splitDirection={takesSplitDirection}
          takeStaff={takesTakeStaff}
          onSelectTake={takesSelectTake}
          onSplit={takesSetSplitDirection}
          onCompare={() => void takesStartComparing()}
          onStopComparing={() => {
            takesSetComparing(false);
          }}
          onTakeStaff={takesSetTakeStaff}
          onDownload={takesDownloadLastTake}
          onHide={takesHideReview}
        />
      )}
    </>
  );
}
