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
  it("reads a <pre> board into rows, linking only cells that open a move", () => {
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
          { href: null, src: `${IMG}/empty.svg`, alt: "" },
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

  it("decodes numeric references in one pass, never twice", () => {
    const [p] = parseBlocks("<p>it&#x27;s &#39;fine&#39; &amp;#39; &amp;lt;b&amp;gt;</p>");
    expect(p).toEqual({ kind: "text", segs: [{ text: "it's 'fine' &#39; &lt;b&gt;" }] });
  });

  it("survives references that name no real character", () => {
    const [p] = parseBlocks("<p>a&#x110000;b&#xD800;c&#0;d&bogus;e</p>");
    expect(p).toEqual({ kind: "text", segs: [{ text: "a\ufffdb\ufffdc\ufffdd&bogus;e" }] });
  });

  it("reads a table's head and its body cell by cell", () => {
    const [t] = parseBlocks(
      `<table align="center"><thead><tr><th>Hand</th><th></th></tr></thead><tbody><tr><td><code>2026-10-14</code></td><td><a href="https://github.com/kanywst">@kanywst</a></td></tr></tbody></table>`,
    );
    expect(t).toEqual({
      kind: "table",
      head: ["Hand", ""],
      rows: [[[{ text: "2026-10-14" }], [{ text: "@kanywst", href: "https://github.com/kanywst" }]]],
    });
  });

  it.each([
    "https://github.com.evil.example/x",
    "https://github.com@evil.example/x",
    "https://user:pw@github.com/x",
    "http://github.com/x",
    "//github.com/x",
    "javascript:alert(1)",
  ])("refuses the look-alike link %s", (href) => {
    const [p] = parseBlocks(`<p><a href="${href}">x</a></p>`);
    expect(p).toEqual({ kind: "text", segs: [{ text: "x" }] });
  });

  it.each([
    "https://raw.githubusercontent.com/0-draft/../someone/x/main/a.svg",
    "https://raw.githubusercontent.com.evil.example/0-draft/a.svg",
    "https://raw.githubusercontent.com/someone/0-draft/a.svg",
  ])("refuses the look-alike image %s", (src) => {
    expect(parseBlocks(`<pre><a href="${ISSUE}"><img src="${src}" alt="x"></a></pre>`)).toEqual([]);
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
