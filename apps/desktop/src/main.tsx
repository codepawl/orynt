import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";

const seedUxrayAgentResponse = import.meta.env.DEV && new URLSearchParams(window.location.search).get("uxrayPreview") === "agent-response";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App seedUxrayAgentResponse={seedUxrayAgentResponse} />
  </StrictMode>,
);
