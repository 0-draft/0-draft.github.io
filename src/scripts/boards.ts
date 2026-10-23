// Keeps the README games current without a rebuild: re-reads each README from GitHub
// when the page loads and whenever the tab comes back into focus (say, after submitting a move).
import { type Block, type GameName, parseGame, readmeUrl, type Seg } from "../lib/readme.ts";

function link(href: string, text: string | Node): HTMLAnchorElement {
  const a = document.createElement("a");
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener";
  a.append(text);
  return a;
}

function segs(list: Seg[]): Node[] {
  return list.map((s) => (s.href ? link(s.href, s.text) : document.createTextNode(s.text)));
}

// Image sizes come from the build (scripts/sync.ts); a refreshed board reuses them by src.
function knownSizes(el: HTMLElement): Map<string, { w: number; h: number }> {
  const sizes = new Map<string, { w: number; h: number }>();
  for (const img of el.querySelectorAll("img")) {
    if (img.width && img.height) sizes.set(img.src, { w: img.width, h: img.height });
  }
  return sizes;
}

function render(blocks: Block[], sizes: Map<string, { w: number; h: number }>): Node[] {
  return blocks.map((b) => {
    if (b.kind === "grid") {
      const grid = document.createElement("div");
      grid.className = "b-grid";
      for (const row of b.rows) {
        const r = document.createElement("div");
        r.className = "b-row";
        for (const c of row) {
          const img = document.createElement("img");
          Object.assign(img, { src: c.src, alt: c.alt, decoding: "async", draggable: false });
          const size = sizes.get(c.src);
          if (size) Object.assign(img, { width: size.w, height: size.h });
          if (c.href) {
            const a = link(c.href, img);
            if (c.alt) a.title = c.alt;
            r.append(a);
          } else r.append(img);
        }
        grid.append(r);
      }
      return grid;
    }
    if (b.kind === "text") {
      const p = document.createElement("p");
      p.className = "b-text";
      p.append(...segs(b.segs));
      return p;
    }
    const table = document.createElement("table");
    table.className = "b-table";
    if (b.head.some((h) => h)) {
      const tr = table.createTHead().insertRow();
      for (const h of b.head) {
        const th = document.createElement("th");
        th.scope = "col";
        th.textContent = h;
        tr.append(th);
      }
    }
    const body = table.createTBody();
    for (const row of b.rows) {
      const tr = body.insertRow();
      for (const cell of row) tr.insertCell().append(...segs(cell));
    }
    return table;
  });
}

function renderGuestbook(list: HTMLElement, blocks: Block[]) {
  const table = blocks.find((b) => b.kind === "table");
  if (table?.kind !== "table") return;
  list.replaceChildren(
    ...table.rows.map(([date, who, msg]) => {
      const li = document.createElement("li");
      const time = document.createElement("time");
      time.textContent = date?.[0]?.text ?? "";
      const w = link(who?.[0]?.href ?? "https://github.com", who?.[0]?.text ?? "");
      w.className = "who";
      w.removeAttribute("target");
      const m = link(msg?.[0]?.href ?? "https://github.com/0-draft/guestbook", msg?.[0]?.text ?? "");
      m.className = "msg";
      m.removeAttribute("target");
      li.append(time, w, m);
      return li;
    }),
  );
}

const seen = new Map<GameName, string>();

async function refresh() {
  const targets = document.querySelectorAll<HTMLElement>("[data-game]");
  await Promise.all(
    [...targets].map(async (el) => {
      const name = el.dataset.game as GameName;
      try {
        const res = await fetch(`${readmeUrl(name)}?t=${Math.floor(Date.now() / 60_000)}`);
        if (!res.ok) return;
        const md = await res.text();
        if (seen.get(name) === md) return;
        seen.set(name, md);
        const blocks = parseGame(name, md);
        if (!blocks) return;
        if (name === "guestbook") renderGuestbook(el, blocks);
        else el.replaceChildren(...render(blocks, knownSizes(el)));
      } catch {
        // The build-time board stays up if GitHub can't be reached.
      }
    }),
  );
}

const idle = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1500));
idle(() => refresh());
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refresh();
});
