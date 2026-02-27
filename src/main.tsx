// MUST be first import — patches fetch/XHR/WebSocket before any module captures them
import "./lib/networkCloak";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initSecurity } from "./lib/security";
import { trackVisit } from "./lib/apiClient";
import { checkCacheVersion } from "./lib/cacheBuster";
import { initPushNotifications } from "./lib/pushNotifications";
import { initVpsClient } from "./lib/vpsClient";

// Initialize anti-DevTools security
initSecurity();

// Render FIRST — everything else is background
createRoot(document.getElementById("root")!).render(<App />);

// All boot tasks are fire-and-forget — NEVER block render
setTimeout(() => {
  trackVisit().catch(() => {});
  checkCacheVersion().catch(() => {});
  try { initPushNotifications(); } catch {}
  initVpsClient().catch(() => {});
}, 100);
