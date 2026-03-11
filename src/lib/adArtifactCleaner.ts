/**
 * Ad Artifact Cleaner v2 — removes stray "0" text nodes injected by ad scripts (Monetag/PropellerAds).
 * These scripts inject invisible tracking elements that render as "0", "00", "0000" etc.
 * v2: Deep subtree observation — catches injections inside ANY element, not just body/root.
 */

const ARTIFACT_PATTERN = /^0+$/;
const SAFE_TAGS = new Set(["INPUT", "TEXTAREA", "CODE", "PRE", "SCRIPT", "STYLE", "NOSCRIPT"]);

function isAdArtifactText(node: Node): boolean {
  if (node.nodeType !== Node.TEXT_NODE) return false;
  const text = node.textContent?.trim();
  if (!text || !ARTIFACT_PATTERN.test(text)) return false;

  const parent = node.parentElement;
  if (!parent) return false;
  if (SAFE_TAGS.has(parent.tagName)) return false;

  // If the parent has other meaningful text besides "0"s, this "0" is likely injected
  // Check: is this text node the ONLY content? If parent has real React content + a stray "0", remove the "0"
  // Key heuristic: legitimate "0" text is usually the only child or inside a specific data element
  // Ad-injected "0" appears as an EXTRA text node sibling alongside real content

  // If parent is body or #root — always clean
  if (parent === document.body || parent.id === "root") return true;

  // If this text node has siblings (other nodes in same parent), it's likely injected
  if (parent.childNodes.length > 1) {
    // Check if there are other non-zero text/element siblings — means this "0" was injected alongside real content
    for (let i = 0; i < parent.childNodes.length; i++) {
      const sibling = parent.childNodes[i];
      if (sibling === node) continue;
      if (sibling.nodeType === Node.ELEMENT_NODE) return true; // has element siblings = injected
      if (sibling.nodeType === Node.TEXT_NODE) {
        const st = sibling.textContent?.trim();
        if (st && !ARTIFACT_PATTERN.test(st)) return true; // has real text siblings = injected
      }
    }
  }

  // Standalone "0" in an empty/classless div — likely ad wrapper
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

  // Use TreeWalker for efficient deep scan of ALL text nodes
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

  // Also check for artifact wrapper divs at body level
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

  // Initial clean
  cleanArtifacts();

  // Deep observe — catches injections anywhere in the DOM
  const observer = new MutationObserver((mutations) => {
    let removed = 0;
    for (const m of mutations) {
      for (const node of Array.from(m.addedNodes)) {
        if (isAdArtifactText(node) || isAdArtifactElement(node)) {
          try { node.parentNode?.removeChild(node); removed++; } catch {}
        }
      }
    }
    // If mutations triggered removals, do a full sweep shortly after (ads may inject in batches)
    if (removed > 0) setTimeout(cleanArtifacts, 300);
  });

  // subtree: true — observe the ENTIRE DOM tree
  observer.observe(document.body, { childList: true, subtree: true });

  // Aggressive sweep: every 2s for first 60s (ad scripts load very late)
  let sweepCount = 0;
  const sweepInterval = setInterval(() => {
    cleanArtifacts();
    sweepCount++;
    if (sweepCount >= 30) clearInterval(sweepInterval);
  }, 2000);

  // CSS fallback for common Monetag artifacts
  const style = document.createElement("style");
  style.textContent = `
    body > div:empty:not(#root):not([class]):not([id]) { display: none !important; }
    body > iframe[style*="display:none"], body > iframe[style*="visibility:hidden"] { display: none !important; }
  `;
  document.head.appendChild(style);
}
