/**
 * Ad Artifact Cleaner — SAFE version
 * 
 * Removes "0"/"00"/etc text nodes injected by ad/tracking scripts.
 * 
 * CRITICAL RULE: NEVER touch anything inside #root.
 * Only cleans direct children of document.body that are NOT #root,
 * NOT <script>, NOT <style>, etc.
 * This prevents React reconciliation crashes (insertBefore/removeChild errors).
 */

const ZERO_RE = /^0+$/;
const IGNORE_TAGS = new Set([
  "SCRIPT", "STYLE", "LINK", "META", "NOSCRIPT",
  "TEMPLATE", "IFRAME", "OBJECT", "EMBED",
]);

function normalizeText(t: string | null): string {
  return (t ?? "").replace(/[\s\u200B\u00A0]/g, "").trim();
}

function isZeroArtifact(t: string | null): boolean {
  const n = normalizeText(t);
  return n.length > 0 && ZERO_RE.test(n);
}

/** Remove stray zero-only nodes that are direct children of <body> */
function sweepBodyChildren() {
  const body = document.body;
  if (!body) return;

  // Only iterate direct children of body
  const children = Array.from(body.childNodes);
  for (const node of children) {
    // Never touch #root or ignored tags
    if (node instanceof HTMLElement) {
      if (node.id === "root") continue;
      if (IGNORE_TAGS.has(node.tagName)) continue;
      // Remove empty wrapper elements that only contain "0" text
      if (node.childElementCount === 0 && isZeroArtifact(node.textContent)) {
        node.remove();
        continue;
      }
    }
    // Remove bare text nodes with only zeros
    if (node.nodeType === Node.TEXT_NODE && isZeroArtifact(node.textContent)) {
      node.remove();
    }
  }
}

export function initAdArtifactCleaner() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if ((window as any).__lyneZeroCleanerV2) return;
  (window as any).__lyneZeroCleanerV2 = true;

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      sweepBodyChildren();
    });
  };

  // Run after DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", schedule, { once: true });
  } else {
    schedule();
  }

  // Watch only direct children of body (NOT subtree inside #root)
  const startObserver = () => {
    const body = document.body;
    if (!body) return;
    const obs = new MutationObserver(() => schedule());
    obs.observe(body, { childList: true, characterData: true });
    // NOTE: subtree: false — we only watch body's direct children
    window.addEventListener("beforeunload", () => obs.disconnect(), { once: true });
  };

  if (document.body) {
    startObserver();
  } else {
    document.addEventListener("DOMContentLoaded", startObserver, { once: true });
  }

  // Periodic fallback for late-injected scripts
  const id = window.setInterval(schedule, 2000);
  window.addEventListener("beforeunload", () => clearInterval(id), { once: true });
}
