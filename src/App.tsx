import { useState } from "react";
import { Provider } from "react-redux";
import { createAppStore } from "./app/store";
import { COURSE_ACCESS_MODE } from "./app/courseCatalog";
import { PlayerRuntimeProvider } from "./app/PlayerRuntimeProvider";
import { PlayerScreen } from "./app/PlayerScreen";

export function App() {
  const [store] = useState(() => createAppStore({ courseAccess: COURSE_ACCESS_MODE }));
  return (
    <Provider store={store}>
      <PlayerRuntimeProvider>
        <PlayerScreen />
      </PlayerRuntimeProvider>
    </Provider>
  );
}
