/**
 * Ad Artifact Cleaner
 * Remove artefatos "0" / "00" injetados fora do React root.
 */

const ZERO_ONLY_RE = /^0+$/;
const SAFE_TAGS = new Set(["SCRIPT", "STYLE", "LINK", "META", "NOSCRIPT"]);

const normalizeText = (value: string | null | undefined) =>
  (value ?? "").replace(/\u200B/g, "").replace(/\s+/g, "").trim();

const isZeroOnly = (value: string | null | undefined) => {
  const text = normalizeText(value);
  return text.length > 0 && ZERO_ONLY_RE.test(text);
};

const isProtectedElement = (el: HTMLElement) =>
  el.id === "root" || SAFE_TAGS.has(el.tagName);

const shouldKeepElement = (el: HTMLElement) => {
  if (isProtectedElement(el)) return true;
  if (el.closest("#root")) return true;

  // Não tocar em portais/modais/toasts nem em elementos de mídia/interação
  if (
    el.querySelector(
      "[data-radix-portal],[role='dialog'],[data-sonner-toaster],video,iframe,img,canvas,svg,button,a,input,textarea,select"
    )
  ) {
    return true;
  }

  return false;
};

function sweepBodyArtifacts() {
  const body = document.body;
  if (!body) return;

  for (const node of Array.from(body.childNodes)) {
    if (node instanceof Text) {
      if (isZeroOnly(node.textContent)) node.remove();
      continue;
    }

    if (!(node instanceof HTMLElement)) continue;
    if (shouldKeepElement(node)) continue;

    if (isZeroOnly(node.textContent)) {
      node.remove();
    }
  }
}

export function initAdArtifactCleaner() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if ((window as any).__lyneZeroCleanerInitialized) return;
  (window as any).__lyneZeroCleanerInitialized = true;

  let rafScheduled = false;
  const scheduleSweep = () => {
    if (rafScheduled) return;
    rafScheduled = true;
    requestAnimationFrame(() => {
      rafScheduled = false;
      sweepBodyArtifacts();
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleSweep, { once: true });
  } else {
    scheduleSweep();
  }

  const observer = new MutationObserver(() => scheduleSweep());
  observer.observe(document.documentElement, {
    childList: true,
    characterData: true,
    subtree: true,
  });

  // Segurança extra para injeções tardias
  setInterval(sweepBodyArtifacts, 2000);
}

