/**
 * Ad Artifact Cleaner v5 — AGGRESSIVE mode
 *
 * Removes stray "0/00" text artifacts injected by third-party ad scripts.
 * More aggressive than v4: catches zeros even in styled wrappers.
 */

const ZERO_RE = /^0+$/;

/** Tags to never touch */
const SKIP_TAGS = new Set([
  "SCRIPT", "STYLE", "LINK", "META", "NOSCRIPT",
  "TEMPLATE", "IFRAME", "OBJECT", "EMBED", "PRE", "CODE",
  "TEXTAREA", "INPUT", "SELECT", "CANVAS", "SVG", "VIDEO", "AUDIO",
]);

/** Tags where "0" could be legitimate (counters, ratings, etc.) */
const SAFE_ATTRS = [
  "data-version-text", "data-version-btn", "data-radix",
  "data-state", "role", "aria-label",
];

function normalizeText(t: string | null): string {
  return (t ?? "").replace(/[\s\u200B\u00A0\uFEFF]/g, "").trim();
}

function isZeroOnly(t: string | null): boolean {
  const n = normalizeText(t);
  return n.length > 0 && n.length <= 4 && ZERO_RE.test(n);
}

/** Whether this element is protected from cleaning */
function isProtected(el: Element | null): boolean {
  if (!el) return false;
  // Protected by data attributes
  if (SAFE_ATTRS.some((a) => el.hasAttribute(a))) return true;
  // Inside a known UI component with meaningful content
  const cl = el.className || "";
  if (typeof cl === "string") {
    // Rating stars, badges, version displays, counters in UI
    if (/vote|rating|star|score|badge|counter|timer|countdown|version|tabular|mono/i.test(cl)) return true;
  }
  return false;
}

/** Check ancestors up to N levels for protection */
function hasProtectedAncestor(el: Element | null, levels = 3): boolean {
  let cur = el;
  for (let i = 0; i < levels && cur; i++) {
    if (isProtected(cur)) return true;
    cur = cur.parentElement;
  }
  return false;
}

/** Determine if a text node with zero content is an ad artifact */
function isZeroArtifact(node: Text): boolean {
  if (!isZeroOnly(node.textContent)) return false;

  const parent = node.parentElement;
  if (!parent) return true; // orphan text node with "0" — artifact

  if (SKIP_TAGS.has(parent.tagName)) return false;
  if (hasProtectedAncestor(parent)) return false;

  const root = document.getElementById("root");
  if (root && root.contains(parent)) {
    // Interactive / semantic elements — never clean
    if (parent.hasAttribute("onClick") || parent.hasAttribute("href")) return false;
    if (parent.tagName === "BUTTON" || parent.tagName === "A") return false;

    // CASE 1: Text node is a loose child among element siblings (e.g. between <nav> and <section>)
    // This is the classic React numeric leak / ad-injected artifact pattern
    if (parent.childElementCount > 0) {
      // The text node sits among element children — it's a stray text node
      // Check that this specific text node is not the only meaningful content
      const siblingElements = parent.children.length;
      if (siblingElements >= 1) return true; // loose "0" among real elements = artifact
    }

    // CASE 2: Parent's ENTIRE text is zero (small wrapper with only "0")
    if (isZeroOnly(parent.textContent)) {
      const gp = parent.parentElement;
      if (gp && gp.childElementCount > 1) {
        const attrs = Array.from(parent.attributes).map((a) => a.name);
        const hasMeaningfulAttr = attrs.some(
          (a) => a !== "style" && a !== "data-zero-cleaned" && !a.startsWith("data-zero")
        );
        if (hasMeaningfulAttr && parent.className && parent.className.length > 5) return false;
      }
      return true;
    }

    return false;
  }

  // Outside #root — always clean
  return true;
}

/** Sweep direct body children for zero artifacts */
function sweepBodyChildren() {
  const body = document.body;
  if (!body) return;
  const root = document.getElementById("root");

  for (const node of Array.from(body.childNodes)) {
    if (node === root) continue;

    if (node instanceof HTMLElement) {
      if (SKIP_TAGS.has(node.tagName)) continue;
      if (node.id && /^(root|__next|app)$/i.test(node.id)) continue;
      if (isZeroOnly(node.textContent) && node.childElementCount === 0) {
        node.remove();
        continue;
      }
    }

    if (node.nodeType === Node.TEXT_NODE && isZeroOnly(node.textContent)) {
      node.remove();
    }
  }
}

/** Inside #root: neutralize suspicious zero text nodes */
function neutralizeInsideRoot() {
  const root = document.getElementById("root");
  if (!root) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return isZeroArtifact(node as Text)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });

  const victims: Text[] = [];
  while (walker.nextNode()) victims.push(walker.currentNode as Text);

  for (const node of victims) {
    node.textContent = "";
    const p = node.parentElement;
    if (p && !p.hasAttribute("data-zero-cleaned")) {
      p.setAttribute("data-zero-cleaned", "1");
      // If parent is now empty and looks injected, hide it
      if (
        p.childElementCount === 0 &&
        normalizeText(p.textContent).length === 0 &&
        !p.hasAttribute("class")
      ) {
        p.style.display = "none";
      }
    }
  }
}

/** Also catch zero-only elements injected anywhere */
function sweepZeroElements() {
  const root = document.getElementById("root");
  if (!root) return;

  // Find all elements inside root whose ONLY content is "0"/"00" and look suspicious
  const all = root.querySelectorAll("div, span, p");
  for (const el of all) {
    if (el.hasAttribute("data-zero-cleaned")) continue;
    if (el.childElementCount > 0) continue;
    if (!isZeroOnly(el.textContent)) continue;
    if (hasProtectedAncestor(el, 5)) continue;
    if (SKIP_TAGS.has(el.tagName)) continue;

    // Check it's not a legit UI element
    const tag = el.tagName;
    if (tag === "BUTTON" || tag === "A") continue;
    if (el.hasAttribute("role") || el.hasAttribute("aria-label")) continue;
    if (el.className && /vote|rating|star|score|badge|counter|timer|version|tabular/i.test(el.className)) continue;

    // Neutralize
    (el as HTMLElement).textContent = "";
    el.setAttribute("data-zero-cleaned", "1");
    // Hide empty shells
    if (!el.className) {
      (el as HTMLElement).style.display = "none";
    }
  }
}

export function initAdArtifactCleaner() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if ((window as any).__lyneZeroCleanerV5) return;
  (window as any).__lyneZeroCleanerV5 = true;

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      sweepBodyChildren();
      neutralizeInsideRoot();
      sweepZeroElements();
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", schedule, { once: true });
  } else {
    schedule();
  }

  const startObserver = () => {
    const body = document.body;
    if (!body) return;

    const obs = new MutationObserver(() => schedule());
    obs.observe(body, { childList: true, subtree: true, characterData: true });
    window.addEventListener("beforeunload", () => obs.disconnect(), { once: true });
  };

  if (document.body) {
    startObserver();
  } else {
    document.addEventListener("DOMContentLoaded", startObserver, { once: true });
  }

  // Periodic sweep for late-injected scripts
  const id = setInterval(schedule, 2000);
  window.addEventListener("beforeunload", () => clearInterval(id), { once: true });
}
