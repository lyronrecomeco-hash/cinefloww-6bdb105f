/**
 * Ad Artifact Cleaner — PRODUCTION-SAFE version v4
 *
 * Removes stray "0/00" text artifacts injected by third-party scripts
 * without mutating React-owned structure in a dangerous way.
 */

const ZERO_RE = /^0+$/;
const IGNORE_TAGS = new Set([
  "SCRIPT", "STYLE", "LINK", "META", "NOSCRIPT",
  "TEMPLATE", "IFRAME", "OBJECT", "EMBED", "PRE", "CODE",
  "TEXTAREA", "INPUT", "SELECT", "CANVAS", "SVG", "VIDEO", "AUDIO",
]);

/** Tags where "0" text may be legitimate UI output */
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

function isBareParent(el: HTMLElement): boolean {
  const attrs = Array.from(el.attributes).map((a) => a.name);
  if (attrs.length === 0) return true;
  return attrs.every((name) => name === "style" || name === "data-zero-cleaned");
}

/** Check if a text node looks like an ad-injected artifact */
function isAdArtifactTextNode(node: Text): boolean {
  if (!isZeroArtifact(node.textContent)) return false;

  const parent = node.parentElement;
  if (!parent) return true;

  const tag = parent.tagName;
  if (IGNORE_TAGS.has(tag)) return false;

  if (parent.hasAttribute("data-version-text") || parent.hasAttribute("data-version-btn")) {
    return false;
  }

  // Conservative rules for common UI tags: only touch completely bare wrappers.
  if (CONTENT_TAGS.has(tag)) {
    if (parent.children.length > 0) return false;
    if (parent.className && parent.className.length > 0) return false;
    if (parent.childNodes.length > 1) return false;
    if (!isBareParent(parent)) return false;
    return true;
  }

  if (parent.children.length > 0) return false;
  if (parent.className && parent.className.length > 0) return false;
  if (parent.childNodes.length > 1) return false;

  return isBareParent(parent);
}

/** Remove zero-only nodes that are direct children of <body> (outside #root) */
function sweepBodyChildren() {
  const body = document.body;
  if (!body) return;

  const children = Array.from(body.childNodes);
  for (const node of children) {
    if (node instanceof HTMLElement) {
      if (node.id === "root") continue;
      if (IGNORE_TAGS.has(node.tagName)) continue;
      if (
        node.childElementCount === 0 &&
        isZeroArtifact(node.textContent) &&
        (!node.className || node.className.length === 0)
      ) {
        node.remove();
        continue;
      }
    }

    if (node.nodeType === Node.TEXT_NODE && isZeroArtifact(node.textContent)) {
      node.remove();
    }
  }
}

/** Inside #root: neutralize only suspicious zero text nodes (do not remove structure) */
function neutralizeArtifactsInsideRoot() {
  const root = document.getElementById("root");
  if (!root) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return isAdArtifactTextNode(node as Text)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });

  const toNeutralize: Text[] = [];
  while (walker.nextNode()) {
    const textNode = walker.currentNode as Text;
    if (normalizeText(textNode.textContent).length > 0) {
      toNeutralize.push(textNode);
    }
  }

  for (const node of toNeutralize) {
    node.textContent = "";
    const parent = node.parentElement;
    if (parent && !parent.hasAttribute("data-zero-cleaned")) {
      parent.setAttribute("data-zero-cleaned", "1");
    }
  }
}

export function initAdArtifactCleaner() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if ((window as any).__lyneZeroCleanerV4) return;
  (window as any).__lyneZeroCleanerV4 = true;

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      sweepBodyChildren();
      neutralizeArtifactsInsideRoot();
    });
  };

  // Run after DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", schedule, { once: true });
  } else {
    schedule();
  }

  const startObserver = () => {
    const body = document.body;
    if (!body) return;

    // Observer for body direct children
    const bodyObs = new MutationObserver(() => schedule());
    bodyObs.observe(body, { childList: true, characterData: true });

    // Observer inside #root — watch new nodes and characterData changes
    const root = document.getElementById("root");
    if (root) {
      const rootObs = new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (m.type === "characterData" || m.addedNodes.length > 0) {
            schedule();
            break;
          }
        }
      });
      rootObs.observe(root, { childList: true, subtree: true, characterData: true });
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
  const id = window.setInterval(schedule, 4000);
  window.addEventListener("beforeunload", () => clearInterval(id), { once: true });
}
