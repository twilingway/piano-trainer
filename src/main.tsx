import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { updateDocumentLanguage } from "./app/interfaceLanguage";
import "./styles.css";

updateDocumentLanguage();
const root = document.getElementById("root");
if (!root) throw new Error("#root is missing from index.html");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
