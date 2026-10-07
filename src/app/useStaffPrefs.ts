import { preferencesActions } from "./preferencesSlice";
import { useAppDispatch, useAppSelector } from "./storeHooks";
import type { StaffPrefs } from "./staffPreferences";
export type { StaffPrefs } from "./staffPreferences";

/** One application-owned preference set shared by the view and settings. */
export function useStaffPrefs() {
  const staffPrefs = useAppSelector((state) => state.preferences.staff);
  const dispatch = useAppDispatch();
  const updateStaffPrefs = (change: Partial<StaffPrefs>) => {
    dispatch(preferencesActions.staffChanged(change));
  };
  return { staffPrefs, updateStaffPrefs };
}
