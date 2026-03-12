/**
 * PlayerShield — Advanced runtime protection for player pages.
 * Blocks debugging, source inspection, network sniffing, and code extraction.
 * Applied on: /player
 */

// ── Anti-debugger: infinite debugger trap ──
let _debuggerActive = false;

function antiDebuggerLoop() {
  if (_debuggerActive) return;
  _debuggerActive = true;

  const trap = () => {
    const start = performance.now();
    // eslint-disable-next-line no-debugger
    debugger;
    const elapsed = performance.now() - start;
    // If debugger paused execution (>100ms), someone is debugging
    if (elapsed > 100) {
      // Corrupt the player state
      document.querySelectorAll("video").forEach(v => {
        v.pause();
        v.removeAttribute("src");
        v.load();
      });
      // Redirect
      try { window.location.replace("about:blank"); } catch {}
    }
  };

  // Run trap at random intervals to evade pattern detection
  const scheduleNext = () => {
    const delay = 1000 + Math.random() * 4000;
    setTimeout(() => {
      trap();
      scheduleNext();
    }, delay);
  };
  scheduleNext();
}

// ── Anti-tampering: Freeze critical APIs ──
function freezePlayerAPIs() {
  try {
    // Prevent overriding fetch/XHR to intercept video URLs
    const _fetch = window.fetch;
    const _xhr = XMLHttpRequest.prototype.open;

    Object.defineProperty(window, "fetch", {
      value: _fetch,
      writable: false,
      configurable: false,
    });

    Object.defineProperty(XMLHttpRequest.prototype, "open", {
      value: _xhr,
      writable: false,
      configurable: false,
    });

    // Freeze performance.now to prevent timing attacks
    const _perfNow = performance.now.bind(performance);
    // Keep it working but non-overridable
    Object.defineProperty(performance, "now", {
      value: _perfNow,
      writable: false,
      configurable: false,
    });
  } catch {}
}

// ── Source URL protection: Hide video src from DOM inspection ──
function protectVideoSources() {
  // Override getAttribute for video/source elements
  const _getAttribute = Element.prototype.getAttribute;
  Element.prototype.getAttribute = function(name: string) {
    if ((this instanceof HTMLVideoElement || this.tagName === "SOURCE") && name === "src") {
      return null; // Hide src from JS inspection
    }
    return _getAttribute.call(this, name);
  };

  // Intercept video.src getter
  const videoProto = HTMLVideoElement.prototype;
  const srcDesc = Object.getOwnPropertyDescriptor(videoProto, "src");
  if (srcDesc) {
    Object.defineProperty(videoProto, "src", {
      get() {
        // Return blob URL or empty to hide real source
        const realSrc = srcDesc.get?.call(this);
        if (realSrc && !realSrc.startsWith("blob:")) return "";
        return realSrc || "";
      },
      set(val) {
        srcDesc.set?.call(this, val);
      },
      configurable: false,
    });
  }

  // Block .currentSrc
  Object.defineProperty(HTMLMediaElement.prototype, "currentSrc", {
    get() { return ""; },
    configurable: false,
  });
}

// ── Network interception protection ──
function blockNetworkSniffing() {
  // Prevent Service Worker registration for sniffing
  if ("serviceWorker" in navigator) {
    const _register = navigator.serviceWorker.register;
    navigator.serviceWorker.register = function(url: string | URL, ...args: any[]) {
      const urlStr = url.toString();
      // Only allow our own SW
      if (!urlStr.includes("sw.js") && !urlStr.includes("workbox")) {
        return Promise.reject(new Error("Blocked"));
      }
      return _register.call(this, url, ...args);
    } as any;
  }

  // Block WebRTC data channel creation for stream extraction
  try {
    const _createDC = RTCPeerConnection.prototype.createDataChannel;
    RTCPeerConnection.prototype.createDataChannel = function(...args: any[]) {
      // Allow only our watch-together channels
      const label = args[0];
      if (typeof label === "string" && !label.includes("watch-room")) {
        throw new Error("Blocked");
      }
      return _createDC.apply(this, args);
    } as any;
  } catch {}
}

// ── Console trap: detect and react to console usage ──
function consolePoison() {
  if (typeof window === "undefined" || !import.meta.env.PROD) return;

  // Overwrite console methods with traps
  const methods = ["log", "debug", "info", "warn", "error", "table", "dir", "trace"] as const;
  methods.forEach(m => {
    try {
      (console as any)[m] = function() {
        // If someone calls console, they're inspecting
        // Silently corrupt video playback after a delay
        setTimeout(() => {
          document.querySelectorAll("video").forEach(v => {
            try { v.pause(); } catch {}
          });
        }, 5000 + Math.random() * 10000);
      };
    } catch {}
  });
}

// ── Integrity check: detect if our code was modified ──
function integrityCheck() {
  // Check if critical functions still exist
  const checks = [
    () => typeof (window as any).Hls !== "undefined" || true,
    () => document.querySelector("video") !== null || Date.now() < 10000,
  ];

  setInterval(() => {
    // Check if someone injected foreign scripts
    const scripts = document.querySelectorAll("script[src]");
    scripts.forEach(s => {
      const src = s.getAttribute("src") || "";
      if (
        src &&
        !src.includes("lyneflix") &&
        !src.includes("lovable") &&
        !src.includes("localhost") &&
        !src.includes("assets/") &&
        !src.includes("sdk/") &&
        !src.includes("workbox") &&
        !src.includes("sw") &&
        !src.includes("supabase")
      ) {
        s.remove(); // Remove injected scripts
      }
    });
  }, 5000);
}

// ── Blob URL protection ──
function protectBlobUrls() {
  const _createObjectURL = URL.createObjectURL;
  URL.createObjectURL = function(obj: Blob | MediaSource) {
    const url = _createObjectURL.call(this, obj);
    // Auto-revoke after 30s to prevent extraction
    setTimeout(() => {
      try { URL.revokeObjectURL(url); } catch {}
    }, 30000);
    return url;
  };
}

// ── Block page source viewing ──
function blockSourceView() {
  // Block view-source protocol
  const _windowOpen = window.open;
  window.open = function(...args: any[]) {
    const url = String(args[0] || "");
    if (
      url.startsWith("view-source:") ||
      url.startsWith("devtools:") ||
      url.startsWith("chrome:") ||
      url.startsWith("about:devtools")
    ) {
      return null;
    }
    return _windowOpen.apply(window, args);
  } as any;

  // Block saving page
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && (e.key === "s" || e.key === "S")) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);
}

// ── Main init function ──
export function initPlayerShield() {
  if (typeof window === "undefined") return;

  // Only activate on player routes
  const path = window.location.pathname;
  const isPlayerRoute = path.startsWith("/player");

  // Only activate on real production domains
  const h = window.location.hostname.toLowerCase();
  const isProd =
    h === "lyneflix.online" ||
    h.endsWith(".lyneflix.online") ||
    h.endsWith(".netlify.app") ||
    h.endsWith(".vercel.app");

  if (!isPlayerRoute) return;

  if (isProd) {
    // Layer 1: Source protection (production only — modifies prototypes)
    protectVideoSources();
    blockSourceView();
    // Layer 2: Anti-debug (production only)
    antiDebuggerLoop();
    consolePoison();

    // Layer 3: API freezing
    freezePlayerAPIs();

    // Layer 4: Network protection
    blockNetworkSniffing();

    // Layer 5: Integrity monitoring
    integrityCheck();

    // Layer 6: Blob protection
    protectBlobUrls();
  }
}

// ── Export individual functions for selective use ──
export {
  antiDebuggerLoop,
  freezePlayerAPIs,
  protectVideoSources,
  blockNetworkSniffing,
  consolePoison,
  integrityCheck,
  protectBlobUrls,
  blockSourceView,
};
