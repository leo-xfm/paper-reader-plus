type MermaidApi = typeof import("mermaid").default;

let mermaidPromise: Promise<MermaidApi> | null = null;
let renderSequence = 0;

export function isMermaidFenceInfo(info: string) {
  return (info.trim().split(/\s+/)[0] || "").toLowerCase() === "mermaid";
}

export function escapeMermaidHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderMermaidPlaceholder(source: string) {
  return [
    '<div class="markdown-mermaid" data-mermaid-state="pending">',
    '  <div class="markdown-mermaid-output"><span class="markdown-mermaid-status">Rendering Mermaid diagram...</span></div>',
    `  <pre class="markdown-mermaid-source">${escapeMermaidHtml(source)}</pre>`,
    "</div>\n",
  ].join("");
}

async function getMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((module) => {
      const mermaid = module.default;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
      });
      return mermaid;
    });
  }
  return mermaidPromise;
}

function sourceFromElement(element: HTMLElement) {
  return element.querySelector<HTMLElement>(".markdown-mermaid-source")?.textContent || "";
}

function setMermaidError(element: HTMLElement, message: string) {
  const output = element.querySelector<HTMLElement>(".markdown-mermaid-output");
  element.classList.add("error");
  element.dataset.mermaidState = "error";
  if (output) output.innerHTML = `<div class="markdown-mermaid-error">${escapeMermaidHtml(message || "Unable to render Mermaid diagram.")}</div>`;
}

export async function renderMermaidElement(element: HTMLElement) {
  const source = sourceFromElement(element).trim();
  const output = element.querySelector<HTMLElement>(".markdown-mermaid-output");
  if (!output) return;

  const token = String(++renderSequence);
  element.dataset.mermaidRenderToken = token;
  element.classList.remove("error");
  element.dataset.mermaidState = "rendering";
  output.innerHTML = '<span class="markdown-mermaid-status">Rendering Mermaid diagram...</span>';

  if (!source) {
    if (element.dataset.mermaidRenderToken === token) setMermaidError(element, "Empty Mermaid diagram.");
    return;
  }

  try {
    const mermaid = await getMermaid();
    const id = `paper-reader-mermaid-${Date.now()}-${renderSequence}`;
    const result = await mermaid.render(id, source);
    if (element.dataset.mermaidRenderToken !== token) return;
    output.innerHTML = result.svg;
    result.bindFunctions?.(output);
    element.dataset.mermaidState = "rendered";
  } catch (error) {
    if (element.dataset.mermaidRenderToken !== token) return;
    setMermaidError(element, error instanceof Error ? error.message : String(error));
  }
}

export function renderMermaidElements(root: ParentNode) {
  const elements = [...root.querySelectorAll<HTMLElement>(".markdown-mermaid")];
  for (const element of elements) {
    void renderMermaidElement(element);
  }
}
