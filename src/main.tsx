// MUST be first import — patches fetch/XHR/WebSocket before any module captures them
import "./lib/networkCloak";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initSecurity } from "./lib/security";
import { initPlayerShield } from "./lib/playerShield";
import { trackVisit } from "./lib/apiClient";
import { checkCacheVersion } from "./lib/cacheBuster";
import { initPushNotifications } from "./lib/pushNotifications";
import { initAdArtifactCleaner } from "./lib/adArtifactCleaner";

// Initialize security layers
initSecurity();
initPlayerShield();

// Render FIRST — everything else is background
createRoot(document.getElementById("root")!).render(<App />);

// Clean ad-injected "0" artifacts immediately after render
initAdArtifactCleaner();

// All boot tasks are fire-and-forget — NEVER block render
setTimeout(() => {
  trackVisit().catch(() => {});
  checkCacheVersion().catch(() => {});
  try { initPushNotifications(); } catch {}
}, 100);
