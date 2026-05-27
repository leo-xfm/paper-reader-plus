const LIST_INDENT = "    ";

type ListStackEntry = {
  rawWidth: number;
  level: number;
};

function markdownIndentWidth(indent: string) {
  return indent.replace(/\t/g, LIST_INDENT).length;
}

function normalizeLineBreaks(source: string) {
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  return { source: source.replace(/\r\n/g, "\n"), newline };
}

function fencedCodeMarker(line: string) {
  const match = /^ {0,3}(`{3,}|~{3,})/.exec(line);
  return match?.[1] || "";
}

function closesFence(line: string, fence: string) {
  const match = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line);
  return Boolean(match && match[1][0] === fence[0] && match[1].length >= fence.length);
}

export function normalizeMarkdownUnorderedListIndent(markdown: string) {
  const { source, newline } = normalizeLineBreaks(String(markdown || ""));
  const lines = source.split("\n");
  const stack: ListStackEntry[] = [];
  let fence = "";
  let changed = false;

  const nextLines = lines.map((line) => {
    if (fence) {
      if (closesFence(line, fence)) fence = "";
      return line;
    }

    const openingFence = fencedCodeMarker(line);
    if (openingFence) {
      fence = openingFence;
      return line;
    }

    const match = /^([ \t]*)([-+*])([ \t]+.*)$/.exec(line);
    if (!match) {
      if (line.trim()) stack.length = 0;
      return line;
    }

    const [, indent, marker, rest] = match;
    const rawWidth = markdownIndentWidth(indent);

    if (stack.length === 0 && rawWidth >= LIST_INDENT.length) {
      return line;
    }

    let level = 0;
    if (stack.length === 0) {
      level = 0;
    } else if (rawWidth > stack[stack.length - 1].rawWidth) {
      level = stack[stack.length - 1].level + 1;
    } else {
      while (stack.length > 0 && rawWidth <= stack[stack.length - 1].rawWidth) stack.pop();
      level = stack.length > 0 ? stack[stack.length - 1].level + 1 : 0;
    }

    stack[level] = { rawWidth, level };
    stack.length = level + 1;

    const normalizedIndent = LIST_INDENT.repeat(level);
    if (normalizedIndent !== indent) changed = true;
    return `${normalizedIndent}${marker}${rest}`;
  });

  return changed ? nextLines.join(newline) : markdown;
}
