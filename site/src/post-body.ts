/**
 * The post format, shared by the Functions and the page. Bodies are never rendered as HTML:
 * they parse into these blocks, so a submission can't carry markup or script.
 *
 *   ## Heading
 *   A paragraph with a [link](https://example.com/page), **bold** and `code`.
 *   ![Alt text](image:1)
 *   - A list item
 *   ```
 *   a code block
 *   ```
 */
export type Inline =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "code"; text: string }
  | { kind: "link"; text: string; href: string };

export type Block =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; parts: Inline[] }
  | { kind: "list"; items: Inline[][] }
  | { kind: "code"; text: string }
  | { kind: "image"; position: number; alt: string };

const IMAGE = /^!\[([^\]]*)\]\(image:(\d+)\)$/;
const INLINE = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*\n]+)\*\*|`([^`\n]+)`/g;
const FENCE = /^```[^\n]*\n([\s\S]*?)^```[ \t]*$/gm;

function inlines(text: string): Inline[] {
  const parts: Inline[] = [];
  let at = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match.index > at) parts.push({ kind: "text", text: text.slice(at, match.index) });
    if (match[3]) parts.push({ kind: "bold", text: match[3] });
    else if (match[4]) parts.push({ kind: "code", text: match[4] });
    else parts.push({ kind: "link", text: match[1]!, href: match[2]! });
    at = match.index + match[0].length;
  }
  if (at < text.length) parts.push({ kind: "text", text: text.slice(at) });
  return parts;
}

function textBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const chunk of text.split(/\n{2,}/)) {
    const part = chunk.trim();
    if (!part) continue;
    const image = IMAGE.exec(part);
    const lines = part.split("\n");
    if (image) blocks.push({ kind: "image", position: Number(image[2]), alt: image[1]! });
    else if (part.startsWith("## ")) blocks.push({ kind: "heading", text: part.slice(3).trim() });
    else if (lines.every((line) => line.startsWith("- "))) {
      blocks.push({ kind: "list", items: lines.map((line) => inlines(line.slice(2).trim())) });
    } else blocks.push({ kind: "paragraph", parts: inlines(part) });
  }
  return blocks;
}

export function parseBody(body: string): Block[] {
  const text = body.replace(/\r\n/g, "\n");
  const blocks: Block[] = [];
  let at = 0;
  // Fences come out first, because a code block can hold blank lines.
  for (const match of text.matchAll(FENCE)) {
    blocks.push(...textBlocks(text.slice(at, match.index)), { kind: "code", text: match[1]!.replace(/\n$/, "") });
    at = match.index + match[0].length;
  }
  blocks.push(...textBlocks(text.slice(at)));
  return blocks;
}

export function linksIn(body: string): string[] {
  const hrefs = (parts: Inline[]) => parts.flatMap((part) => (part.kind === "link" ? [part.href] : []));
  return parseBody(body).flatMap((block) => {
    if (block.kind === "paragraph") return hrefs(block.parts);
    return block.kind === "list" ? block.items.flatMap(hrefs) : [];
  });
}

export function imagesIn(body: string): number[] {
  return parseBody(body).flatMap((block) => (block.kind === "image" ? [block.position] : []));
}
