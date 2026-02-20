// MUST be first import — patches fetch/XHR/WebSocket before any module captures them
import "./lib/networkCloak";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initSecurity } from "./lib/security";
import { trackVisit } from "./lib/apiClient";
import { checkCacheVersion } from "./lib/cacheBuster";

// Initialize anti-DevTools security
initSecurity();

// Track visitor (non-blocking)
trackVisit();

// Check for remote cache invalidation (non-blocking)
checkCacheVersion();

createRoot(document.getElementById("root")!).render(<App />);
