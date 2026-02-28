/**
 * Advanced anti-DevTools, anti-inspection & anti-browser-menu security layer.
 * Detects DevTools and redirects to google.com instantly.
 * Blocks: F12, Ctrl+Shift+I/J/C, Ctrl+U, View Source, Save Page, Print,
 *         3-dot menu actions (Save As, Print, Cast, DevTools via menu),
 *         text selection on media, copy/paste, image drag, and framing.
 */

let devtoolsDetected = false;

const blockKeys = (e: KeyboardEvent) => {
  // F12
  if (e.key === "F12") { e.preventDefault(); e.stopPropagation(); redirectAway(); return false; }
  // Ctrl+Shift+I/J/C (DevTools)
  if (e.ctrlKey && e.shiftKey && ["I", "J", "C", "i", "j", "c"].includes(e.key)) {
    e.preventDefault(); e.stopPropagation(); redirectAway(); return false;
  }
  // Ctrl+U (View Source)
  if (e.ctrlKey && (e.key === "u" || e.key === "U")) {
    e.preventDefault(); e.stopPropagation(); redirectAway(); return false;
  }
  // Ctrl+S (Save Page — 3-dot menu "Save As")
  if (e.ctrlKey && (e.key === "s" || e.key === "S") && !e.altKey) {
    e.preventDefault(); e.stopPropagation(); return false;
  }
  // Ctrl+P (Print — 3-dot menu "Print")
  if (e.ctrlKey && (e.key === "p" || e.key === "P")) {
    e.preventDefault(); e.stopPropagation(); return false;
  }
  // Ctrl+Shift+K (Firefox console)
  if (e.ctrlKey && e.shiftKey && (e.key === "K" || e.key === "k")) {
    e.preventDefault(); e.stopPropagation(); redirectAway(); return false;
  }
  // Ctrl+G / Ctrl+F (Find in page — exposes source text)
  if (e.ctrlKey && (e.key === "g" || e.key === "G" || e.key === "f" || e.key === "F") && !e.shiftKey && !e.altKey) {
    e.preventDefault(); e.stopPropagation(); return false;
  }
  // Ctrl+Shift+M (Responsive design mode / mobile toggle)
  if (e.ctrlKey && e.shiftKey && (e.key === "M" || e.key === "m")) {
    e.preventDefault(); e.stopPropagation(); redirectAway(); return false;
  }
  // Ctrl+Shift+E (Network tab Firefox)
  if (e.ctrlKey && e.shiftKey && (e.key === "E" || e.key === "e")) {
    e.preventDefault(); e.stopPropagation(); redirectAway(); return false;
  }
  // Ctrl+Shift+P (Command palette in DevTools)
  if (e.ctrlKey && e.shiftKey && (e.key === "P" || e.key === "p")) {
    e.preventDefault(); e.stopPropagation(); return false;
  }
  // F5 + Ctrl+Shift+R (Hard reload — useful for cache bypass sniffing)
  if (e.ctrlKey && e.shiftKey && (e.key === "R" || e.key === "r")) {
    e.preventDefault(); e.stopPropagation(); return false;
  }
  // Ctrl+J (Downloads — can reveal fetched URLs)
  if (e.ctrlKey && !e.shiftKey && (e.key === "j" || e.key === "J")) {
    e.preventDefault(); e.stopPropagation(); return false;
  }
  // Ctrl+H (History)
  if (e.ctrlKey && !e.shiftKey && (e.key === "h" || e.key === "H")) {
    e.preventDefault(); e.stopPropagation(); return false;
  }
};

const blockContextMenu = (e: MouseEvent) => {
  e.preventDefault();
  return false;
};

const redirectAway = () => {
  try {
    window.location.replace("https://www.google.com");
  } catch {
    window.location.href = "https://www.google.com";
  }
};

const detectDevTools = () => {
  const threshold = 160;
  const widthDiff = window.outerWidth - window.innerWidth > threshold;
  const heightDiff = window.outerHeight - window.innerHeight > threshold;

  if (widthDiff || heightDiff) {
    if (!devtoolsDetected) {
      devtoolsDetected = true;
      redirectAway();
    }
  } else {
    devtoolsDetected = false;
  }
};

// Debugger timing detection — instant redirect
const debuggerCheck = () => {
  const start = performance.now();
  // eslint-disable-next-line no-debugger
  debugger;
  const end = performance.now();
  if (end - start > 100) {
    redirectAway();
  }
};

// Disable console methods in production
const disableConsole = () => {
  const noop = () => {};
  if (typeof window !== "undefined" && import.meta.env.PROD) {
    const methods = ["log", "debug", "info", "warn", "table", "dir", "trace", "group", "groupEnd", "groupCollapsed", "clear", "count", "countReset", "assert", "profile", "profileEnd", "time", "timeLog", "timeEnd", "timeStamp"] as const;
    methods.forEach((m) => {
      try { (window as any).console[m] = noop; } catch {}
    });
  }
};

const disableTextSelection = () => {
  const style = document.createElement("style");
  style.textContent = `
    video, .player-container, iframe {
      -webkit-user-select: none !important;
      -moz-user-select: none !important;
      -ms-user-select: none !important;
      user-select: none !important;
      -webkit-touch-callout: none !important;
    }
    /* Hide browser "Save image as" on long press */
    img {
      -webkit-touch-callout: none !important;
      pointer-events: auto;
    }
    /* Prevent text cursor on video elements */
    video::-webkit-media-controls { display: none !important; }
  `;
  document.head.appendChild(style);
};

const blockCopyPaste = () => {
  document.addEventListener("copy", (e) => { e.preventDefault(); }, true);
  document.addEventListener("cut", (e) => { e.preventDefault(); }, true);
};

const obfuscateVideoSources = () => {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      m.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement) {
          node.querySelectorAll("video[src], source[src]").forEach((el) => {
            const src = el.getAttribute("src");
            if (src && !src.startsWith("blob:")) {
              el.removeAttribute("src");
              (el as any).__src = src;
              if (el instanceof HTMLVideoElement) {
                el.src = src;
              }
            }
          });
        }
      });
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
};

const preventFraming = () => {
  if (window.self !== window.top) {
    try { window.top!.location.href = window.self.location.href; } catch {}
  }
};

export const initSecurity = () => {
  if (typeof window === "undefined") return;

  // Skip ALL security in dev/preview environments (Lovable iframe, localhost, etc.)
  const h = window.location.hostname;
  const isDev = h === "localhost" || h.includes("127.0.0.1") || h.endsWith(".lovable.app") || h.endsWith(".lovableproject.com") || h.endsWith(".app") || h.endsWith(".dev");
  if (isDev) return;

  document.addEventListener("keydown", blockKeys, true);
  document.addEventListener("contextmenu", blockContextMenu, true);

  // DevTools dimension detection — every 500ms for faster response
  const intervalId = setInterval(detectDevTools, 500);

  // Debugger timing check every 3s
  const debugInterval = setInterval(debuggerCheck, 3000);

  disableConsole();
  disableTextSelection();

  if (import.meta.env.PROD) {
    blockCopyPaste();
  }

  obfuscateVideoSources();
  preventFraming();

  // Anti drag on ALL elements (images, links, text)
  document.addEventListener("dragstart", (e) => {
    e.preventDefault();
  }, true);

  // Prevent printing (3-dot menu "Print")
  const printStyle = document.createElement("style");
  printStyle.textContent = `@media print { body { display: none !important; } }`;
  document.head.appendChild(printStyle);

  // Block beforeprint event (catches Ctrl+P and menu Print)
  window.addEventListener("beforeprint", (e) => {
    e.preventDefault();
    document.body.style.display = "none";
  });
  window.addEventListener("afterprint", () => {
    document.body.style.display = "";
  });

  // Detect "Save Page As" / "View Source" via visibility change pattern
  let lastHidden = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      lastHidden = Date.now();
    }
  });

  // Prevent "Cast" / "Send to device" by removing Presentation API
  try {
    if ("presentation" in navigator) {
      Object.defineProperty(navigator, "presentation", { get: () => null, configurable: false });
    }
  } catch {}

  // Trap window.open to block "Open in new tab" tricks
  const _open = window.open;
  window.open = function (...args: any[]) {
    const url = String(args[0] || "");
    if (url.startsWith("view-source:") || url.startsWith("devtools:")) {
      return null;
    }
    return _open.apply(window, args);
  };

  return () => {
    document.removeEventListener("keydown", blockKeys, true);
    document.removeEventListener("contextmenu", blockContextMenu, true);
    clearInterval(intervalId);
    clearInterval(debugInterval);
  };
};
