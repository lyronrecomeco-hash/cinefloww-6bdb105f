/**
 * Advanced anti-DevTools & anti-inspection security layer.
 * Blocks F12, Ctrl+Shift+I/J/C, right-click context menu,
 * and detects DevTools via debugger timing + dimension heuristics.
 */

let devtoolsDetected = false;

const blockKeys = (e: KeyboardEvent) => {
  // F12
  if (e.key === "F12") { e.preventDefault(); e.stopPropagation(); return false; }
  // Ctrl+Shift+I / Ctrl+Shift+J / Ctrl+Shift+C
  if (e.ctrlKey && e.shiftKey && ["I", "J", "C", "i", "j", "c"].includes(e.key)) {
    e.preventDefault(); e.stopPropagation(); return false;
  }
  // Ctrl+U (view source)
  if (e.ctrlKey && (e.key === "u" || e.key === "U")) {
    e.preventDefault(); e.stopPropagation(); return false;
  }
  // Ctrl+S (save page)
  if (e.ctrlKey && (e.key === "s" || e.key === "S") && !e.altKey) {
    e.preventDefault(); e.stopPropagation(); return false;
  }
};

const blockContextMenu = (e: MouseEvent) => {
  e.preventDefault();
  return false;
};

const detectDevTools = () => {
  const threshold = 160;
  const widthDiff = window.outerWidth - window.innerWidth > threshold;
  const heightDiff = window.outerHeight - window.innerHeight > threshold;

  if (widthDiff || heightDiff) {
    if (!devtoolsDetected) {
      devtoolsDetected = true;
      handleDevToolsOpen();
    }
  } else {
    devtoolsDetected = false;
  }
};

const handleDevToolsOpen = () => {
  // Clear sensitive content from DOM
  try {
    const videos = document.querySelectorAll("video");
    videos.forEach((v) => {
      v.src = "";
      v.load();
    });
    const iframes = document.querySelectorAll("iframe");
    iframes.forEach((f) => {
      f.src = "about:blank";
    });
  } catch {}
};

// Debugger timing detection
const debuggerCheck = () => {
  const start = performance.now();
  // eslint-disable-next-line no-debugger
  debugger;
  const end = performance.now();
  if (end - start > 100 && !devtoolsDetected) {
    devtoolsDetected = true;
    handleDevToolsOpen();
  }
};

// Disable console methods
const disableConsole = () => {
  const noop = () => {};
  if (typeof window !== "undefined" && import.meta.env.PROD) {
    (window as any).console.log = noop;
    (window as any).console.debug = noop;
    (window as any).console.info = noop;
    (window as any).console.warn = noop;
    (window as any).console.table = noop;
    (window as any).console.dir = noop;
  }
};

// Anti text selection on video areas
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

export const initSecurity = () => {
  if (typeof window === "undefined") return;

  // Block keyboard shortcuts
  document.addEventListener("keydown", blockKeys, true);

  // Block right-click
  document.addEventListener("contextmenu", blockContextMenu, true);

  // DevTools dimension detection
  const intervalId = setInterval(detectDevTools, 1000);

  // Periodic debugger check (less aggressive, every 5s)
  const debugInterval = setInterval(debuggerCheck, 5000);

  // Disable console in production
  disableConsole();

  // Anti text selection on media
  disableTextSelection();

  // Anti drag on images
  document.addEventListener("dragstart", (e) => {
    if ((e.target as HTMLElement)?.tagName === "IMG") {
      e.preventDefault();
    }
  }, true);

  return () => {
    document.removeEventListener("keydown", blockKeys, true);
    document.removeEventListener("contextmenu", blockContextMenu, true);
    clearInterval(intervalId);
    clearInterval(debugInterval);
  };
};
