/**
 * Advanced anti-DevTools, anti-inspection & anti-browser-menu security layer.
 * Detects DevTools and redirects to a warning image.
 */

const REDIRECT_URL = "https://i.pinimg.com/236x/31/49/2c/31492c6b6eef5b99fdc8202084718714.jpg?nii=t";

let devtoolsDetected = false;

const redirectAway = () => {
  try { window.location.replace(REDIRECT_URL); } catch { window.location.href = REDIRECT_URL; }
};

const blockKeys = (e: KeyboardEvent) => {
  if (e.key === "F12") { e.preventDefault(); e.stopPropagation(); redirectAway(); return false; }
  if (e.ctrlKey && e.shiftKey && ["I","J","C","i","j","c"].includes(e.key)) { e.preventDefault(); e.stopPropagation(); redirectAway(); return false; }
  if (e.ctrlKey && (e.key === "u" || e.key === "U")) { e.preventDefault(); e.stopPropagation(); redirectAway(); return false; }
  if (e.ctrlKey && (e.key === "s" || e.key === "S") && !e.altKey) { e.preventDefault(); e.stopPropagation(); return false; }
  if (e.ctrlKey && (e.key === "p" || e.key === "P")) { e.preventDefault(); e.stopPropagation(); return false; }
  if (e.ctrlKey && e.shiftKey && (e.key === "K" || e.key === "k")) { e.preventDefault(); e.stopPropagation(); redirectAway(); return false; }
  if (e.ctrlKey && (e.key === "g" || e.key === "G" || e.key === "f" || e.key === "F") && !e.shiftKey && !e.altKey) { e.preventDefault(); e.stopPropagation(); return false; }
  if (e.ctrlKey && e.shiftKey && (e.key === "M" || e.key === "m")) { e.preventDefault(); e.stopPropagation(); redirectAway(); return false; }
  if (e.ctrlKey && e.shiftKey && (e.key === "E" || e.key === "e")) { e.preventDefault(); e.stopPropagation(); redirectAway(); return false; }
  if (e.ctrlKey && e.shiftKey && (e.key === "P" || e.key === "p")) { e.preventDefault(); e.stopPropagation(); return false; }
  if (e.ctrlKey && e.shiftKey && (e.key === "R" || e.key === "r")) { e.preventDefault(); e.stopPropagation(); return false; }
  if (e.ctrlKey && !e.shiftKey && (e.key === "j" || e.key === "J")) { e.preventDefault(); e.stopPropagation(); return false; }
  if (e.ctrlKey && !e.shiftKey && (e.key === "h" || e.key === "H")) { e.preventDefault(); e.stopPropagation(); return false; }
};

const blockContextMenu = (e: MouseEvent) => { e.preventDefault(); return false; };

const detectDevTools = () => {
  const threshold = 160;
  const w = window.outerWidth - window.innerWidth > threshold;
  const h = window.outerHeight - window.innerHeight > threshold;
  if (w || h) { if (!devtoolsDetected) { devtoolsDetected = true; redirectAway(); } } else { devtoolsDetected = false; }
};

const consoleDetect = () => {
  const el = new Image();
  let detected = false;
  Object.defineProperty(el, 'id', { get() { detected = true; redirectAway(); } });
  try { console.log('%c', el as any); } catch {}
  if (!detected) {
    const d = /./;
    d.toString = function () { redirectAway(); return ''; };
    try { console.log(d); } catch {}
  }
};

const disableConsole = () => {
  const noop = () => {};
  if (typeof window !== "undefined" && import.meta.env.PROD) {
    const methods = ["log","debug","info","warn","table","dir","trace","group","groupEnd","groupCollapsed","clear","count","countReset","assert","profile","profileEnd","time","timeLog","timeEnd","timeStamp"] as const;
    methods.forEach((m) => { try { (window as any).console[m] = noop; } catch {} });
  }
};

const disableTextSelection = () => {
  const style = document.createElement("style");
  style.textContent = `video,.player-container,iframe{-webkit-user-select:none!important;-moz-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important}img{-webkit-touch-callout:none!important}video::-webkit-media-controls{display:none!important}`;
  document.head.appendChild(style);
};

const blockCopyPaste = () => {
  document.addEventListener("copy", (e) => e.preventDefault(), true);
  document.addEventListener("cut", (e) => e.preventDefault(), true);
};

const obfuscateVideoSources = () => {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      m.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement) {
          node.querySelectorAll("video[src], source[src]").forEach((el) => {
            const src = el.getAttribute("src");
            if (src && !src.startsWith("blob:")) { el.removeAttribute("src"); (el as any).__src = src; if (el instanceof HTMLVideoElement) el.src = src; }
          });
        }
      });
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
};

const preventFraming = () => {
  if (window.self !== window.top) { try { window.top!.location.href = window.self.location.href; } catch {} }
};

export const initSecurity = () => {
  if (typeof window === "undefined") return;

  const h = window.location.hostname;
  const isDev = h === "localhost" || h.includes("127.0.0.1") || h.endsWith(".lovable.app") || h.endsWith(".lovableproject.com") || h.endsWith(".app") || h.endsWith(".dev");
  if (isDev) return;

  document.addEventListener("keydown", blockKeys, true);
  document.addEventListener("contextmenu", blockContextMenu, true);

  const intervalId = setInterval(detectDevTools, 500);
  const debugInterval = setInterval(consoleDetect, 3000);

  disableConsole();
  disableTextSelection();
  if (import.meta.env.PROD) blockCopyPaste();
  obfuscateVideoSources();
  preventFraming();

  document.addEventListener("dragstart", (e) => e.preventDefault(), true);

  const printStyle = document.createElement("style");
  printStyle.textContent = `@media print{body{display:none!important}}`;
  document.head.appendChild(printStyle);

  window.addEventListener("beforeprint", (e) => { e.preventDefault(); document.body.style.display = "none"; });
  window.addEventListener("afterprint", () => { document.body.style.display = ""; });

  try { if ("presentation" in navigator) Object.defineProperty(navigator, "presentation", { get: () => null, configurable: false }); } catch {}

  const _open = window.open;
  window.open = function (...args: any[]) {
    const url = String(args[0] || "");
    if (url.startsWith("view-source:") || url.startsWith("devtools:")) return null;
    return _open.apply(window, args);
  };

  return () => {
    document.removeEventListener("keydown", blockKeys, true);
    document.removeEventListener("contextmenu", blockContextMenu, true);
    clearInterval(intervalId);
    clearInterval(debugInterval);
  };
};
