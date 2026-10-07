import { useState } from "react";
import { Provider } from "react-redux";
import { createAppStore } from "./app/store";
import { PlayerRuntimeProvider } from "./app/PlayerRuntimeProvider";
import { PlayerScreen } from "./app/PlayerScreen";

export function App() {
  const [store] = useState(createAppStore);
  return (
    <Provider store={store}>
      <PlayerRuntimeProvider>
        <PlayerScreen />
      </PlayerRuntimeProvider>
    </Provider>
  );
}
