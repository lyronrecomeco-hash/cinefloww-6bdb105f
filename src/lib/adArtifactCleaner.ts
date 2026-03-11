/**
 * Ad Artifact Cleaner v3 — removes stray "0" text nodes injected by ad scripts (Monetag/PropellerAds).
 * v3: Uses a whitelist of protected elements + aggressive periodic cleanup.
 */

const ARTIFACT_PATTERN = /^0+$/;
const SAFE_TAGS = new Set(["INPUT", "TEXTAREA", "CODE", "PRE", "SCRIPT", "STYLE", "NOSCRIPT"]);

function isProtected(el: Element | null): boolean {
  if (!el) return false;
  // Elements with data-version-text are protected (version button text)
  if (el.hasAttribute("data-version-text")) return true;
  if (el.closest("[data-version-btn]")) return false; // Inside version btn but not the text span — remove
  return false;
}

function isAdArtifactText(node: Node): boolean {
  if (node.nodeType !== Node.TEXT_NODE) return false;
  const text = node.textContent?.trim();
  if (!text || !ARTIFACT_PATTERN.test(text)) return false;

  const parent = node.parentElement;
  if (!parent) return false;
  if (SAFE_TAGS.has(parent.tagName)) return false;

  // Protected elements keep their text
  if (isProtected(parent)) return false;

  // If parent is body or #root — always clean
  if (parent === document.body || parent.id === "root") return true;

  // Inside version button but NOT the protected span — it's injected
  if (parent.closest("[data-version-btn]")) return true;

  // If this text node has element siblings, it's likely injected
  if (parent.childNodes.length > 1) {
    for (let i = 0; i < parent.childNodes.length; i++) {
      const sibling = parent.childNodes[i];
      if (sibling === node) continue;
      if (sibling.nodeType === Node.ELEMENT_NODE) return true;
      if (sibling.nodeType === Node.TEXT_NODE) {
        const st = sibling.textContent?.trim();
        if (st && !ARTIFACT_PATTERN.test(st)) return true;
      }
    }
  }

  // Standalone "0" in empty div
  if (parent.tagName === "DIV" && !parent.className && !parent.id && parent.childNodes.length <= 2) {
    return true;
  }

  return false;
}

function isAdArtifactElement(node: Node): boolean {
  if (node.nodeType !== Node.ELEMENT_NODE) return false;
  const el = node as HTMLElement;
  if (el.tagName === "DIV" && !el.className && !el.id && el.children.length === 0) {
    const text = el.textContent?.trim();
    if (text && ARTIFACT_PATTERN.test(text)) return true;
  }
  return false;
}

function cleanArtifacts() {
  const body = document.body;
  if (!body) return;

  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const text = node.textContent?.trim();
      if (text && ARTIFACT_PATTERN.test(text)) return NodeFilter.FILTER_ACCEPT;
      return NodeFilter.FILTER_REJECT;
    }
  });

  const toRemove: Node[] = [];
  let current: Node | null;
  while ((current = walker.nextNode())) {
    if (isAdArtifactText(current)) toRemove.push(current);
  }

  body.childNodes.forEach((node) => {
    if (isAdArtifactElement(node)) toRemove.push(node);
  });

  toRemove.forEach((n) => {
    try { n.parentNode?.removeChild(n); } catch {}
  });

  return toRemove.length;
}

export function initAdArtifactCleaner() {
  if (typeof window === "undefined") return;

  cleanArtifacts();

  const observer = new MutationObserver((mutations) => {
    let removed = 0;
    for (const m of mutations) {
      for (const node of Array.from(m.addedNodes)) {
        if (isAdArtifactText(node) || isAdArtifactElement(node)) {
          try { node.parentNode?.removeChild(node); removed++; } catch {}
        }
      }
    }
    if (removed > 0) setTimeout(cleanArtifacts, 200);
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Aggressive sweep: every 2s for first 60s
  let sweepCount = 0;
  const sweepInterval = setInterval(() => {
    cleanArtifacts();
    sweepCount++;
    if (sweepCount >= 30) clearInterval(sweepInterval);
  }, 2000);

  // CSS fallback
  const style = document.createElement("style");
  style.textContent = `
    body > div:empty:not(#root):not([class]):not([id]) { display: none !important; }
    body > iframe[style*="display:none"], body > iframe[style*="visibility:hidden"] { display: none !important; }
  `;
  document.head.appendChild(style);
}
