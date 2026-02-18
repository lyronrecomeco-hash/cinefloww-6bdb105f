/**
 * Advanced anti-DevTools & anti-inspection security layer.
 * Blocks F12, Ctrl+Shift+I/J/C, right-click context menu,
 * and detects DevTools via debugger timing + dimension heuristics.
 * Also prevents source viewing, copy-paste on sensitive elements,
 * and obfuscates network requests.
 */

let devtoolsDetected = false;
let devtoolsWarnings = 0;

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
  // Ctrl+P (print)
  if (e.ctrlKey && (e.key === "p" || e.key === "P")) {
    e.preventDefault(); e.stopPropagation(); return false;
  }
  // Ctrl+Shift+K (Firefox console)
  if (e.ctrlKey && e.shiftKey && (e.key === "K" || e.key === "k")) {
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
      devtoolsWarnings++;
      handleDevToolsOpen();
    }
  } else {
    devtoolsDetected = false;
  }
};

const handleDevToolsOpen = () => {
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
    const methods = ["log", "debug", "info", "warn", "table", "dir", "trace", "group", "groupEnd", "groupCollapsed", "clear", "count", "countReset", "assert", "profile", "profileEnd", "time", "timeLog", "timeEnd", "timeStamp"] as const;
    methods.forEach((m) => {
      try { (window as any).console[m] = noop; } catch {}
    });
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

// Anti copy-paste on body
const blockCopyPaste = () => {
  document.addEventListener("copy", (e) => { e.preventDefault(); }, true);
  document.addEventListener("cut", (e) => { e.preventDefault(); }, true);
};

// Obfuscate source links in DOM - hide video src attributes from inspection
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

// Prevent page from being loaded in an iframe (anti-embedding)
const preventFraming = () => {
  if (window.self !== window.top) {
    try { window.top!.location.href = window.self.location.href; } catch {}
  }
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

  // Block copy-paste in production
  if (import.meta.env.PROD) {
    blockCopyPaste();
  }

  // Obfuscate video sources in DOM
  obfuscateVideoSources();

  // Prevent page from being embedded
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
