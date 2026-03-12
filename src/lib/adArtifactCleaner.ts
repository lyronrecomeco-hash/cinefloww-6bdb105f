/**
 * Ad Artifact Cleaner
 * Remove artefatos "0" / "00" injetados fora do fluxo normal do app.
 */

const ZERO_ONLY_RE = /^0+$/;
const SAFE_TAGS = new Set(["SCRIPT", "STYLE", "LINK", "META", "NOSCRIPT", "OPTION", "TEXTAREA", "PRE", "CODE"]);

const normalizeText = (value: string | null | undefined) =>
  (value ?? "").replace(/\u200B/g, "").replace(/\s+/g, "").trim();

const isZeroOnly = (value: string | null | undefined) => {
  const text = normalizeText(value);
  return text.length > 0 && ZERO_ONLY_RE.test(text);
};

const hasSafeAncestor = (node: Node) => {
  let el: HTMLElement | null = node instanceof HTMLElement ? node : node.parentElement;
  while (el) {
    if (SAFE_TAGS.has(el.tagName)) return true;
    el = el.parentElement;
  }
  return false;
};

const isInsideRoot = (node: Node) => {
  const el = node instanceof HTMLElement ? node : node.parentElement;
  return !!el?.closest("#root");
};

const shouldRemoveTextNode = (node: Text) => {
  if (!isZeroOnly(node.textContent)) return false;
  if (hasSafeAncestor(node)) return false;

  const parent = node.parentElement;
  if (!parent) return true;

  if (!isInsideRoot(node)) return true;

  // Corrige zeros fantasmas em áreas críticas da UI sem tocar no conteúdo normal
  if (parent.id === "root") return true;
  if (parent.closest("nav,header")) return true;

  return false;
};

function sweepZeroTextNodes() {
  const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
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

function sweepBodyArtifacts() {
  sweepZeroTextNodes();

  const body = document.body;
  if (!body) return;

  for (const el of Array.from(body.children)) {
    if (el.id === "root" || SAFE_TAGS.has(el.tagName)) continue;
    if (isZeroOnly(el.textContent)) el.remove();
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
    attributes: true,
  });

  const intervalId = window.setInterval(sweepBodyArtifacts, 1000);
  window.addEventListener("beforeunload", () => window.clearInterval(intervalId), { once: true });
}

