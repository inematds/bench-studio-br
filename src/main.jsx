import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { I18nProvider } from "./i18n/index.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <I18nProvider>
    <App />
  </I18nProvider>,
);
