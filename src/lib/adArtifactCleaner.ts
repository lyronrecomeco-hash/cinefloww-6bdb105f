/**
 * Ad Artifact Cleaner v5 — remove artefatos "0" de scripts de anúncio
 * sem tocar no DOM do React (#root), evitando erro de reconciliação.
 */

const ARTIFACT_PATTERN = /^0+$/;

function isRootOrInsideRoot(node: Node | null): boolean {
  if (!node) return false;
  const el = node.nodeType === Node.ELEMENT_NODE
    ? (node as Element)
    : (node.parentElement ?? null);
  if (!el) return false;
  return !!el.closest("#root");
}

function removeNodeSafe(node: Node): boolean {
  try {
    if (!node.parentNode) return false;
    node.parentNode.removeChild(node);
    return true;
  } catch {
    return false;
  }
}

function isDirectBodyArtifact(node: Node): boolean {
  if (!document.body || node.parentNode !== document.body) return false;
  if (isRootOrInsideRoot(node)) return false;

  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent?.trim();
    return !!text && ARTIFACT_PATTERN.test(text);
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return false;
  const el = node as HTMLElement;

  if (el.id === "root") return false;

  // Div vazio/solto contendo apenas 0/00/000
  if (el.tagName === "DIV" && !el.id && !el.className) {
    const text = el.textContent?.trim();
    if (text && ARTIFACT_PATTERN.test(text)) return true;
  }

  return false;
}

function cleanBodyArtifacts() {
  const body = document.body;
  if (!body) return 0;

  const toRemove: Node[] = [];
  body.childNodes.forEach((node) => {
    if (isDirectBodyArtifact(node)) toRemove.push(node);
  });

  let removed = 0;
  toRemove.forEach((node) => {
    if (removeNodeSafe(node)) removed++;
  });

  return removed;
}

export function initAdArtifactCleaner() {
  if (typeof window === "undefined") return;

  cleanBodyArtifacts();

  const observer = new MutationObserver((mutations) => {
    let removed = 0;

    for (const mutation of mutations) {
      if (mutation.target !== document.body) continue;

      for (const node of Array.from(mutation.addedNodes)) {
        if (isDirectBodyArtifact(node) && removeNodeSafe(node)) {
          removed++;
        }
      }
    }

    if (removed > 0) {
      // varredura curta após reinjeção agressiva
      setTimeout(cleanBodyArtifacts, 120);
    }
  });

  // Observa só filhos diretos do body para nunca interferir no #root
  observer.observe(document.body, { childList: true, subtree: false });

  // Sweep curta no boot (30s)
  let sweepCount = 0;
  const sweepInterval = setInterval(() => {
    cleanBodyArtifacts();
    sweepCount += 1;
    if (sweepCount >= 15) clearInterval(sweepInterval);
  }, 2000);

  // CSS fallback apenas para artefatos fora do app
  const style = document.createElement("style");
  style.textContent = `
    body > :not(#root):is(div):empty:not([class]):not([id]) { display: none !important; }
    body > iframe[style*="display:none"], body > iframe[style*="visibility:hidden"] { display: none !important; }
  `;
  document.head.appendChild(style);
}
