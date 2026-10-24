// Turns the live region of a README game (between <!-- NAME:START --> and <!-- NAME:END -->)
// into plain data, so the site renders it with its own markup instead of injecting HTML.
// Runs at build time and again in the browser to refresh a board without a rebuild.

export interface Cell {
  href: string | null;
  src: string;
  alt: string;
  // Intrinsic size of the image, filled in at build time so the board doesn't shift as it loads.
  w?: number;
  h?: number;
}

export interface Seg {
  text: string;
  href?: string;
}

export type Block =
  | { kind: "grid"; rows: Cell[][] }
  | { kind: "text"; segs: Seg[] }
  | { kind: "table"; head: string[]; rows: Seg[][][] };

// Compared on parsed URLs, not string prefixes: a prefix check lets
// "https://github.com.evil/", "https://github.com@evil/" or ".../0-draft/../someone/" through.
function parsed(url: string): URL | null {
  try {
    return new URL(decode(url));
  } catch {
    return null;
  }
}

function safeHref(url: string): string | null {
  const u = parsed(url);
  return u && u.origin === "https://github.com" && !u.username && !u.password ? u.href : null;
}

function safeImg(url: string): string | null {
  const u = parsed(url);
  return u && u.origin === "https://raw.githubusercontent.com" && u.pathname.startsWith("/0-draft/") ? u.href : null;
}

const NAMED: Record<string, string> = { quot: '"', lt: "<", gt: ">", nbsp: " ", amp: "&" };

// One pass, so nothing is decoded twice ("&amp;lt;" stays the text "&lt;"), and a reference
// that names no real character stays as written instead of throwing.
function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (ref, body: string) => {
    if (body[0] !== "#") return NAMED[body.toLowerCase()] ?? ref;
    const code = body[1] === "x" || body[1] === "X" ? Number.parseInt(body.slice(2), 16) : Number(body.slice(1));
    const real = code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff);
    return real ? String.fromCodePoint(code) : "\ufffd";
  });
}

// Removes markup until none is left: one pass over "<scr<b>ipt>" would leave "<script>".
// The result is only ever rendered as text, but it should also read as plain text.
function stripTags(html: string): string {
  let out = html;
  for (let prev = ""; prev !== out; ) {
    prev = out;
    out = out.replace(/<[^>]*>/g, "");
  }
  return out.replace(/[<>]/g, "");
}

function segments(html: string): Seg[] {
  const segs: Seg[] = [];
  const re = /<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>|<[^>]+>|([^<]+)/g;
  for (const m of html.matchAll(re)) {
    if (m[1] !== undefined) {
      const text = decode(stripTags(m[2])).trim();
      const href = safeHref(m[1]);
      if (text) segs.push(href ? { text, href } : { text });
    } else if (m[3] !== undefined) {
      // A lone space between two links still matters: without it their words run together.
      const text = decode(m[3]).replace(/\s+/g, " ");
      if (text) segs.push({ text });
    }
  }
  const first = segs[0];
  const last = segs.at(-1);
  if (first && !first.href) first.text = first.text.trimStart();
  if (last && !last.href) last.text = last.text.trimEnd();
  return segs.filter((s) => s.text);
}

function grid(pre: string): Cell[][] {
  const cellRe = /<a\s+href="([^"]+)"><img\s+src="([^"]+)"[^>]*?alt="([^"]*)"[^>]*><\/a>/g;
  return pre
    .split("\n")
    .map((line) =>
      [...line.matchAll(cellRe)].flatMap((m) => {
        const src = safeImg(m[2]);
        if (!src) return [];
        // A cell is a link only when it does something: opens a prefilled move issue.
        // The rest point back at the README itself and would just be empty tab stops.
        const href = safeHref(m[1]);
        return [{ href: href?.includes("/issues/new") ? href : null, src, alt: decode(m[3]) }];
      }),
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
  const re = /<pre>([\s\S]*?)<\/pre>|<p[^>]*>([\s\S]*?)<\/p>|<table[^>]*>([\s\S]*?)<\/table>/g;
  for (const m of region.matchAll(re)) {
    if (m[1] !== undefined) {
      const rows = grid(m[1]);
      if (rows.length) blocks.push({ kind: "grid", rows });
    } else if (m[2] !== undefined) {
      const segs = segments(m[2]);
      if (segs.length) blocks.push({ kind: "text", segs });
    } else if (m[3] !== undefined) {
      const thead = m[3].match(/<thead>([\s\S]*?)<\/thead>/)?.[1] ?? "";
      const head = [...thead.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((th) =>
        segments(th[1])
          .map((x) => x.text)
          .join(""),
      );
      const tbody = m[3].match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? "";
      const rows = [...tbody.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((tr) =>
        [...tr[1].matchAll(/<td>([\s\S]*?)<\/td>/g)].map((td) => segments(td[1])),
      );
      if (rows.length) blocks.push({ kind: "table", head, rows });
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
