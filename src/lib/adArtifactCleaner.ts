/**
 * Ad Artifact Cleaner — PRODUCTION-SAFE version v3
 * 
 * Removes "0"/"00"/etc text nodes injected by ad/tracking scripts.
 * 
 * Strategy:
 * - OUTSIDE #root: remove nodes directly (safe, no React there)
 * - INSIDE #root: wrap stray zero-only text nodes in a hidden <span>
 *   instead of removing them, to avoid React reconciliation crashes.
 */

const ZERO_RE = /^0+$/;
const IGNORE_TAGS = new Set([
  "SCRIPT", "STYLE", "LINK", "META", "NOSCRIPT",
  "TEMPLATE", "IFRAME", "OBJECT", "EMBED", "PRE", "CODE",
  "TEXTAREA", "INPUT", "SELECT", "CANVAS", "SVG", "VIDEO", "AUDIO",
]);

/** Tags where "0" text is legitimately rendered (timers, counters, badges) */
const CONTENT_TAGS = new Set([
  "SPAN", "P", "H1", "H2", "H3", "H4", "H5", "H6", "DIV",
  "BUTTON", "A", "LABEL", "TD", "TH", "LI", "STRONG", "EM", "B", "I",
]);

function normalizeText(t: string | null): string {
  return (t ?? "").replace(/[\s\u200B\u00A0]/g, "").trim();
}

function isZeroArtifact(t: string | null): boolean {
  const n = normalizeText(t);
  return n.length > 0 && ZERO_RE.test(n);
}

/** Check if a text node looks like an ad-injected artifact */
function isAdArtifactTextNode(node: Text): boolean {
  if (!isZeroArtifact(node.textContent)) return false;
  
  const parent = node.parentElement;
  if (!parent) return true; // orphan text node with "0" — artifact
  
  // Never touch content inside legitimate UI elements that might show "0"
  // Check if parent has meaningful React/UI attributes
  const tag = parent.tagName;
  
  // If parent is a known content tag with other children or classes, skip
  if (CONTENT_TAGS.has(tag)) {
    // If the parent has data attributes, classes, or other children, it's likely legit UI
    if (parent.children.length > 0) return false; // has child elements = UI component
    if (parent.className && parent.className.length > 0) return false; // has CSS classes = styled component
    if (parent.hasAttribute("data-version-text")) return false; // version display
    if (parent.hasAttribute("data-version-btn")) return false;
    
    // A bare tag with ONLY "0" text and no classes = likely artifact
    // But be conservative — only flag if the tag is a bare div/span with no attributes
    const attrCount = parent.attributes.length;
    if (attrCount > 0) return false;
  }
  
  // If parent is in ignore list, skip
  if (IGNORE_TAGS.has(tag)) return false;
  
  return true;
}

/** Remove stray zero-only nodes that are direct children of <body> (outside #root) */
function sweepBodyChildren() {
  const body = document.body;
  if (!body) return;

  const children = Array.from(body.childNodes);
  for (const node of children) {
    if (node instanceof HTMLElement) {
      if (node.id === "root") continue;
      if (IGNORE_TAGS.has(node.tagName)) continue;
      if (node.childElementCount === 0 && isZeroArtifact(node.textContent)) {
        node.remove();
        continue;
      }
    }
    if (node.nodeType === Node.TEXT_NODE && isZeroArtifact(node.textContent)) {
      node.remove();
    }
  }
}

/** Inside #root: hide (not remove) zero-artifact text nodes injected by scripts */
function hideArtifactsInsideRoot() {
  const root = document.getElementById("root");
  if (!root) return;

  // Use TreeWalker to find bare text nodes with only "0"
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!isZeroArtifact(node.textContent)) return NodeFilter.FILTER_REJECT;
      // Only target text nodes that are the ONLY child of their parent
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_ACCEPT;
      if (IGNORE_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
      // Skip if parent has meaningful content (other text or elements)
      if (parent.childNodes.length > 1) return NodeFilter.FILTER_REJECT;
      // Skip styled/classed elements (legitimate UI)
      if (parent.className && parent.className.length > 5) return NodeFilter.FILTER_REJECT;
      if (parent.hasAttribute("data-version-text")) return NodeFilter.FILTER_REJECT;
      // If parent is completely bare (no class, no id, no data attrs) = artifact
      if (parent.attributes.length === 0 || 
          (parent.attributes.length === 1 && parent.hasAttribute("style"))) {
        return NodeFilter.FILTER_ACCEPT;
      }
      return NodeFilter.FILTER_REJECT;
    }
  });

  const toHide: HTMLElement[] = [];
  while (walker.nextNode()) {
    const parent = walker.currentNode.parentElement;
    if (parent && !parent.hasAttribute("data-zero-hidden")) {
      toHide.push(parent);
    }
  }

  // Hide by setting display:none (safe — doesn't remove from DOM, no React crash)
  for (const el of toHide) {
    el.style.display = "none";
    el.setAttribute("data-zero-hidden", "1");
  }
}

export function initAdArtifactCleaner() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if ((window as any).__lyneZeroCleanerV3) return;
  (window as any).__lyneZeroCleanerV3 = true;

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      sweepBodyChildren();
      hideArtifactsInsideRoot();
    });
  };

  // Run after DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", schedule, { once: true });
  } else {
    schedule();
  }

  // Watch body direct children (outside #root)
  const startObserver = () => {
    const body = document.body;
    if (!body) return;
    
    // Observer for body direct children
    const bodyObs = new MutationObserver(() => schedule());
    bodyObs.observe(body, { childList: true, characterData: true });
    
    // Observer inside #root — watch for script-injected nodes
    const root = document.getElementById("root");
    if (root) {
      const rootObs = new MutationObserver((mutations) => {
        // Only schedule if mutations added new nodes (not React re-renders)
        for (const m of mutations) {
          if (m.addedNodes.length > 0) {
            schedule();
            break;
          }
        }
      });
      rootObs.observe(root, { childList: true, subtree: true });
      window.addEventListener("beforeunload", () => rootObs.disconnect(), { once: true });
    }
    
    window.addEventListener("beforeunload", () => bodyObs.disconnect(), { once: true });
  };

  if (document.body) {
    startObserver();
  } else {
    document.addEventListener("DOMContentLoaded", startObserver, { once: true });
  }

  // Periodic fallback for late-injected scripts
  const id = window.setInterval(schedule, 3000);
  window.addEventListener("beforeunload", () => clearInterval(id), { once: true });
}
