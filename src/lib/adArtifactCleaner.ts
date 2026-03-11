/**
 * Ad Artifact Cleaner — removes stray "0" text nodes injected by ad scripts (Monetag/PropellerAds).
 * These scripts inject invisible tracking elements that sometimes render as "0", "00", "0000" etc.
 */

const ARTIFACT_PATTERN = /^0+$/;

function isAdArtifact(node: Node): boolean {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent?.trim();
    if (text && ARTIFACT_PATTERN.test(text)) {
      // Only clean if parent is body, #root, or a high-level container — not inside form inputs, etc.
      const parent = node.parentElement;
      if (!parent) return false;
      const tag = parent.tagName;
      // Don't touch legitimate form elements or code blocks
      if (["INPUT", "TEXTAREA", "CODE", "PRE", "SCRIPT", "STYLE"].includes(tag)) return false;
      // Check if this text node is likely injected (not part of React render tree)
      // React text nodes are usually inside specific elements, not floating directly under body/root
      if (parent === document.body || parent.id === "root") return true;
      // Check for ad-injected wrapper divs (no React attributes)
      if (tag === "DIV" && !parent.className && !parent.getAttribute("data-reactroot") && parent.childNodes.length <= 2) {
        return true;
      }
      return false;
    }
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as HTMLElement;
    // Monetag injects empty divs, iframes with display:none, etc. that sometimes show "0"
    if (el.tagName === "DIV" && !el.className && !el.id && el.children.length === 0) {
      const text = el.textContent?.trim();
      if (text && ARTIFACT_PATTERN.test(text)) return true;
    }
  }

  return false;
}

function cleanArtifacts() {
  // Clean direct children of body
  const body = document.body;
  if (!body) return;

  const toRemove: Node[] = [];

  // Check body's direct children
  body.childNodes.forEach((node) => {
    if (isAdArtifact(node)) toRemove.push(node);
  });

  // Check #root's direct children (shouldn't have stray text)
  const root = document.getElementById("root");
  if (root) {
    root.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE && ARTIFACT_PATTERN.test(node.textContent?.trim() || "")) {
        toRemove.push(node);
      }
    });
  }

  toRemove.forEach((n) => {
    try { n.parentNode?.removeChild(n); } catch {}
  });
}

export function initAdArtifactCleaner() {
  if (typeof window === "undefined") return;

  // Initial clean
  cleanArtifacts();

  // Observe for new injections
  const observer = new MutationObserver((mutations) => {
    let dirty = false;
    for (const m of mutations) {
      for (const node of Array.from(m.addedNodes)) {
        if (isAdArtifact(node)) {
          try { node.parentNode?.removeChild(node); } catch {}
          dirty = true;
        }
      }
    }
    // Periodic full sweep if mutations detected
    if (dirty) setTimeout(cleanArtifacts, 500);
  });

  observer.observe(document.body, { childList: true, subtree: false });

  const root = document.getElementById("root");
  if (root) observer.observe(root, { childList: true, subtree: false });

  // Periodic sweep every 3s for first 30s (ad scripts load late)
  let sweepCount = 0;
  const sweepInterval = setInterval(() => {
    cleanArtifacts();
    sweepCount++;
    if (sweepCount >= 10) clearInterval(sweepInterval);
  }, 3000);

  // Also add CSS to hide common Monetag artifacts
  const style = document.createElement("style");
  style.textContent = `
    body > div:empty:not(#root):not([class]):not([id]) { display: none !important; }
    body > iframe[style*="display:none"], body > iframe[style*="visibility:hidden"] { display: none !important; }
  `;
  document.head.appendChild(style);
}
