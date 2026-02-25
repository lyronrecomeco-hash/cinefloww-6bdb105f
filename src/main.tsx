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

// Track visitor (non-blocking)
trackVisit();

// Check for remote cache invalidation (non-blocking)
checkCacheVersion();

// Initialize push notifications (auto-subscribe if already granted)
initPushNotifications();

// Initialize VPS client (auto-detect if VPS API is available)
initVpsClient();

createRoot(document.getElementById("root")!).render(<App />);
