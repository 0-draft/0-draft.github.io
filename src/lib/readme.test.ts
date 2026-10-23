import { describe, expect, it } from "vitest";
import { liveRegion, parseBlocks, parseGame } from "./readme.ts";

const IMG = "https://raw.githubusercontent.com/0-draft/shogi/main/.github/koma";
const ISSUE = "https://github.com/0-draft/shogi/issues/new?title=shogi%7Csel+9a&amp;body=go";

const readme = (body: string) =>
  `# Shogi\n\nintro\n\n<!-- SHOGI:START -->\n${body}\n<!-- SHOGI:END -->\n\n## How to play\n`;

describe("liveRegion", () => {
  it("returns the text between the markers", () => {
    expect(liveRegion(readme("<p>hi</p>"), "SHOGI")).toContain("<p>hi</p>");
  });

  it("returns null when a marker is missing or out of order", () => {
    expect(liveRegion("<!-- SHOGI:START --> no end", "SHOGI")).toBeNull();
    expect(liveRegion("<!-- SHOGI:END --> <!-- SHOGI:START -->", "SHOGI")).toBeNull();
  });
});

describe("parseBlocks", () => {
  it("reads a <pre> board into rows of linked cells", () => {
    const pre = `<pre><a href="${ISSUE}"><img src="${IMG}/gL.svg" align="top" alt="9a white lance"></a><a href="https://github.com/0-draft/shogi#shogi"><img src="${IMG}/empty.svg" align="top" alt=""></a>
<a href="${ISSUE}"><img src="${IMG}/sP.svg" align="top" alt="9g black pawn"></a></pre>`;
    const [grid] = parseBlocks(pre);
    expect(grid).toEqual({
      kind: "grid",
      rows: [
        [
          {
            href: "https://github.com/0-draft/shogi/issues/new?title=shogi%7Csel+9a&body=go",
            src: `${IMG}/gL.svg`,
            alt: "9a white lance",
          },
          { href: "https://github.com/0-draft/shogi#shogi", src: `${IMG}/empty.svg`, alt: "" },
        ],
        [
          {
            href: "https://github.com/0-draft/shogi/issues/new?title=shogi%7Csel+9a&body=go",
            src: `${IMG}/sP.svg`,
            alt: "9g black pawn",
          },
        ],
      ],
    });
  });

  it("drops images that are not hosted in the org and links that leave GitHub", () => {
    const pre = `<pre><a href="https://evil.example/x"><img src="${IMG}/gL.svg" alt="a"></a><a href="${ISSUE}"><img src="https://evil.example/x.svg" alt="b"></a></pre>`;
    const [grid] = parseBlocks(pre);
    expect(grid).toEqual({ kind: "grid", rows: [[{ href: null, src: `${IMG}/gL.svg`, alt: "a" }]] });
  });

  it("turns a paragraph into text and link segments with entities decoded", () => {
    const [p] = parseBlocks(
      `<p align="center">Last move &amp; more · <a href="${ISSUE}">Resign</a> <a href="javascript:alert(1)">bad</a></p>`,
    );
    expect(p).toEqual({
      kind: "text",
      segs: [
        { text: "Last move & more · " },
        { text: "Resign", href: "https://github.com/0-draft/shogi/issues/new?title=shogi%7Csel+9a&body=go" },
        { text: " " },
        { text: "bad" },
      ],
    });
  });

  it("reads table bodies cell by cell and ignores the head", () => {
    const [t] = parseBlocks(
      `<table><thead><tr><th>x</th></tr></thead><tbody><tr><td><code>2026-10-14</code></td><td><a href="https://github.com/kanywst">@kanywst</a></td></tr></tbody></table>`,
    );
    expect(t).toEqual({
      kind: "table",
      rows: [[[{ text: "2026-10-14" }], [{ text: "@kanywst", href: "https://github.com/kanywst" }]]],
    });
  });

  it("keeps blocks in document order", () => {
    const kinds = parseBlocks(`<p>a</p><pre><a href="${ISSUE}"><img src="${IMG}/x.svg" alt=""></a></pre><p>b</p>`).map(
      (b) => b.kind,
    );
    expect(kinds).toEqual(["text", "grid", "text"]);
  });
});

describe("parseGame", () => {
  it("parses the region for the named game", () => {
    expect(parseGame("shogi", readme("<p>Click a piece</p>"))).toEqual([
      { kind: "text", segs: [{ text: "Click a piece" }] },
    ]);
  });

  it("returns null for a README without the game's markers", () => {
    expect(parseGame("blackjack", readme("<p>x</p>"))).toBeNull();
  });
});
