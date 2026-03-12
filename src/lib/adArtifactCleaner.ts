/**
 * Ad Artifact Cleaner
 * Remove artefatos "0"/"00" injetados FORA da árvore React,
 * sem tocar em nós gerenciados pela aplicação (evita crash de reconciliação).
 */

const ZERO_ONLY_RE = /^0+$/;
const SAFE_TAGS = new Set(["SCRIPT", "STYLE", "LINK", "META", "NOSCRIPT", "OPTION", "TEXTAREA", "PRE", "CODE"]);
const SAFE_SELECTORS = [
  "#root",
  "[data-radix-portal]",
  "[role='dialog']",
  "[role='alertdialog']",
  "[aria-live]",
  "[data-sonner-toaster]",
  "[data-allow-zero]",
  "input",
  "textarea",
  "select",
  "[contenteditable='true']",
].join(",");

const normalizeText = (value: string | null | undefined) =>
  (value ?? "").replace(/\u200B/g, "").replace(/\s+/g, "").trim();

const isZeroOnly = (value: string | null | undefined) => {
  const text = normalizeText(value);
  return text.length > 0 && ZERO_ONLY_RE.test(text);
};

const hasProtectedAncestor = (node: Node) => {
  const el = node instanceof HTMLElement ? node : node.parentElement;
  return !!el?.closest(SAFE_SELECTORS);
};

const shouldRemoveTextNode = (node: Text) => {
  if (!isZeroOnly(node.textContent)) return false;
  if (hasProtectedAncestor(node)) return false;
  return true;
};

function sweepBodyRootArtifacts() {
  const body = document.body;
  if (!body) return;

  for (const node of Array.from(body.childNodes)) {
    if (node instanceof HTMLElement && (node.id === "root" || SAFE_TAGS.has(node.tagName))) continue;

    if (node instanceof Text) {
      if (isZeroOnly(node.textContent)) node.remove();
      continue;
    }

    if (node instanceof HTMLElement) {
      if (node.closest(SAFE_SELECTORS)) continue;
      if (node.childElementCount === 0 && isZeroOnly(node.textContent)) node.remove();
    }
  }
}

function sweepOutsideAppTextNodes() {
  const body = document.body;
  if (!body) return;

  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  const targets: Text[] = [];

  let current = walker.nextNode();
  while (current) {
    if (current instanceof Text) targets.push(current);
    current = walker.nextNode();
  }

  for (const textNode of targets) {
    if (shouldRemoveTextNode(textNode)) textNode.remove();
  }
}

function runSweep() {
  sweepBodyRootArtifacts();
  sweepOutsideAppTextNodes();
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
      runSweep();
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleSweep, { once: true });
  } else {
    scheduleSweep();
  }

  const observer = new MutationObserver(() => scheduleSweep());
  observer.observe(document.body || document.documentElement, {
    childList: true,
    characterData: true,
    subtree: true,
  });

  const intervalId = window.setInterval(scheduleSweep, 1500);
  window.addEventListener("beforeunload", () => {
    observer.disconnect();
    window.clearInterval(intervalId);
  }, { once: true });
}


