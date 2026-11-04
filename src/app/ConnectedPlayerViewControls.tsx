import { shallowEqual } from "react-redux";
import { ViewToggles } from "../ui/ViewToggles";
import { useRuntimeSelector } from "./PlayerRuntimeProvider";

/** Kept outside the runtime composition so view controls read their own narrow subscription. */
export function ConnectedPlayerViewControls() {
  const { staffPrefs, updateStaffPrefs, hasScore, course, comparing } = useRuntimeSelector(
    (runtime) => ({
      staffPrefs: runtime.staffPrefs,
      updateStaffPrefs: runtime.updateStaffPrefs,
      hasScore: Boolean(runtime.score.staffXml),
      course: runtime.course,
      comparing: runtime.takes.comparing
    }),
    shallowEqual
  );
  return (
    <ViewToggles
      prefs={staffPrefs}
      hasScore={hasScore}
      onChange={updateStaffPrefs}
      courseScore={
        course.active && !comparing
          ? { view: course.saved.view, onView: course.setView }
          : undefined
      }
    />
  );
}
