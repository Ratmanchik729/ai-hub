import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/pixelify-sans/400.css";
import "@fontsource/pixelify-sans/600.css";
import "@fontsource/press-start-2p/400.css";
import "@fontsource/comfortaa/500.css";
import "@fontsource/comfortaa/700.css";
import "@fontsource/nunito/400.css";
import "@fontsource/nunito/700.css";
import "@fontsource/oswald/400.css";
import "@fontsource/oswald/600.css";
import "./styles.css";
import { App } from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
