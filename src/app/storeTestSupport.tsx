import type { ReactNode } from "react";
import { Provider } from "react-redux";
import { createAppStore, type AppStore } from "./store";

/** Creates a fresh instance after each test has installed its saved preferences. */
export function withTestStore(children: ReactNode, store: AppStore = createAppStore()) {
  return <Provider store={store}>{children}</Provider>;
}
