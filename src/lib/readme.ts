// Turns the live region of a README game (between <!-- NAME:START --> and <!-- NAME:END -->)
// into plain data, so the site renders it with its own markup instead of injecting HTML.
// Runs at build time and again in the browser to refresh a board without a rebuild.

export interface Cell {
  href: string | null;
  src: string;
  alt: string;
}

export interface Seg {
  text: string;
  href?: string;
}

export type Block =
  | { kind: "grid"; rows: Cell[][] }
  | { kind: "text"; segs: Seg[] }
  | { kind: "table"; rows: Seg[][][] };

const LINK_HOSTS = ["https://github.com/"];
const IMG_PREFIX = "https://raw.githubusercontent.com/0-draft/";

function safeHref(url: string): string | null {
  const u = decode(url);
  return LINK_HOSTS.some((h) => u.startsWith(h)) ? u : null;
}

function decode(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function segments(html: string): Seg[] {
  const segs: Seg[] = [];
  const re = /<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>|<[^>]+>|([^<]+)/g;
  for (const m of html.matchAll(re)) {
    if (m[1] !== undefined) {
      const text = decode(m[2].replace(/<[^>]+>/g, "")).trim();
      const href = safeHref(m[1]);
      if (text) segs.push(href ? { text, href } : { text });
    } else if (m[3] !== undefined) {
      const text = decode(m[3]).replace(/\s+/g, " ");
      if (text.trim()) segs.push({ text });
    }
  }
  return segs;
}

function grid(pre: string): Cell[][] {
  const cellRe = /<a\s+href="([^"]+)"><img\s+src="([^"]+)"[^>]*?alt="([^"]*)"[^>]*><\/a>/g;
  return pre
    .split("\n")
    .map((line) =>
      [...line.matchAll(cellRe)]
        .filter((m) => m[2].startsWith(IMG_PREFIX))
        .map((m) => ({ href: safeHref(m[1]), src: m[2], alt: decode(m[3]) })),
    )
    .filter((row) => row.length > 0);
}

export function liveRegion(markdown: string, marker: string): string | null {
  const start = markdown.indexOf(`<!-- ${marker}:START -->`);
  const end = markdown.indexOf(`<!-- ${marker}:END -->`);
  if (start < 0 || end < start) return null;
  return markdown.slice(start, end);
}

export function parseBlocks(region: string): Block[] {
  const blocks: Block[] = [];
  const re = /<pre>([\s\S]*?)<\/pre>|<p[^>]*>([\s\S]*?)<\/p>|<tbody>([\s\S]*?)<\/tbody>/g;
  for (const m of region.matchAll(re)) {
    if (m[1] !== undefined) {
      const rows = grid(m[1]);
      if (rows.length) blocks.push({ kind: "grid", rows });
    } else if (m[2] !== undefined) {
      const segs = segments(m[2]);
      if (segs.length) blocks.push({ kind: "text", segs });
    } else if (m[3] !== undefined) {
      const rows = [...m[3].matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((tr) =>
        [...tr[1].matchAll(/<td>([\s\S]*?)<\/td>/g)].map((td) => segments(td[1])),
      );
      if (rows.length) blocks.push({ kind: "table", rows });
    }
  }
  return blocks;
}

export const GAMES = {
  blackjack: "BLACKJACK",
  shogi: "SHOGI",
  guestbook: "GUESTBOOK",
} as const;

export type GameName = keyof typeof GAMES;

export function readmeUrl(name: GameName): string {
  return `https://raw.githubusercontent.com/0-draft/${name}/main/README.md`;
}

export function parseGame(name: GameName, markdown: string): Block[] | null {
  const region = liveRegion(markdown, GAMES[name]);
  return region ? parseBlocks(region) : null;
}
