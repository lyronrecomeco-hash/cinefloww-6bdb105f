import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initSecurity } from "./lib/security";
import { initNetworkCloak } from "./lib/networkCloak";
import { trackVisit } from "./lib/apiClient";

// Initialize network cloaking BEFORE anything else
initNetworkCloak();

// Initialize anti-DevTools security
initSecurity();

// Track visitor (non-blocking)
trackVisit();

createRoot(document.getElementById("root")!).render(<App />);
