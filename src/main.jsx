import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { registerServiceWorker } from "./lib/pwa.js";
// fonts ship with the app: no requests to third-party font CDNs
import "@fontsource-variable/onest";
import "@fontsource-variable/literata/opsz.css";
import "@fontsource-variable/literata/opsz-italic.css";
import "@fontsource-variable/jetbrains-mono";
import "./styles.css";

registerServiceWorker();

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
