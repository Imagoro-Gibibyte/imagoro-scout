/**
 * The post format, shared by the Functions and the page. Bodies are never rendered as HTML:
 * they parse into these blocks, so a submission can't carry markup or script.
 *
 *   ## Heading
 *   A paragraph with a [link](https://example.com/page).
 *   ![Alt text](image:1)
 */
export type Inline = { kind: "text"; text: string } | { kind: "link"; text: string; href: string };

export type Block =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; parts: Inline[] }
  | { kind: "image"; position: number; alt: string };

const IMAGE = /^!\[([^\]]*)\]\(image:(\d+)\)$/;
const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;

function inlines(text: string): Inline[] {
  const parts: Inline[] = [];
  let at = 0;
  for (const match of text.matchAll(LINK)) {
    if (match.index > at) parts.push({ kind: "text", text: text.slice(at, match.index) });
    parts.push({ kind: "link", text: match[1]!, href: match[2]! });
    at = match.index + match[0].length;
  }
  if (at < text.length) parts.push({ kind: "text", text: text.slice(at) });
  return parts;
}

export function parseBody(body: string): Block[] {
  const blocks: Block[] = [];
  for (const chunk of body.replace(/\r\n/g, "\n").split(/\n{2,}/)) {
    const text = chunk.trim();
    if (!text) continue;
    const image = IMAGE.exec(text);
    if (image) blocks.push({ kind: "image", position: Number(image[2]), alt: image[1]! });
    else if (text.startsWith("## ")) blocks.push({ kind: "heading", text: text.slice(3).trim() });
    else blocks.push({ kind: "paragraph", parts: inlines(text) });
  }
  return blocks;
}

export function linksIn(body: string): string[] {
  return parseBody(body).flatMap((block) =>
    block.kind === "paragraph" ? block.parts.flatMap((part) => (part.kind === "link" ? [part.href] : [])) : []
  );
}

export function imagesIn(body: string): number[] {
  return parseBody(body).flatMap((block) => (block.kind === "image" ? [block.position] : []));
}
