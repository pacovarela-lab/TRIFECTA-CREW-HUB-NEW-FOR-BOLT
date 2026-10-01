import { createRoot } from "react-dom/client";
import { FrontendEnvironmentGate } from "./components/FrontendEnvironmentGate";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/inter/latin-900.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import "./index.css";

createRoot(document.getElementById("root")!).render(<FrontendEnvironmentGate />);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
