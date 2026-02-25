/**
 * Advanced anti-DevTools & anti-inspection security layer.
 * Detects DevTools and redirects to google.com instantly.
 */

let devtoolsDetected = false;

const blockKeys = (e: KeyboardEvent) => {
  if (e.key === "F12") { e.preventDefault(); e.stopPropagation(); redirectAway(); return false; }
  if (e.ctrlKey && e.shiftKey && ["I", "J", "C", "i", "j", "c"].includes(e.key)) {
    e.preventDefault(); e.stopPropagation(); redirectAway(); return false;
  }
  if (e.ctrlKey && (e.key === "u" || e.key === "U")) {
    e.preventDefault(); e.stopPropagation(); redirectAway(); return false;
  }
  if (e.ctrlKey && (e.key === "s" || e.key === "S") && !e.altKey) {
    e.preventDefault(); e.stopPropagation(); return false;
  }
  if (e.ctrlKey && (e.key === "p" || e.key === "P")) {
    e.preventDefault(); e.stopPropagation(); return false;
  }
  if (e.ctrlKey && e.shiftKey && (e.key === "K" || e.key === "k")) {
    e.preventDefault(); e.stopPropagation(); redirectAway(); return false;
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

  // Anti drag on images
  document.addEventListener("dragstart", (e) => {
    if ((e.target as HTMLElement)?.tagName === "IMG") {
      e.preventDefault();
    }
  }, true);

  // Prevent printing
  const printStyle = document.createElement("style");
  printStyle.textContent = `@media print { body { display: none !important; } }`;
  document.head.appendChild(printStyle);

  return () => {
    document.removeEventListener("keydown", blockKeys, true);
    document.removeEventListener("contextmenu", blockContextMenu, true);
    clearInterval(intervalId);
    clearInterval(debugInterval);
  };
};
