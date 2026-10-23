// Refreshes everything the site reads at build time:
//   src/data/repos.json     public, unarchived, non-fork repos of the org
//   src/data/games.json     the live board of each README game
//   src/data/articles.json  latest dev.to articles
// A source that fails keeps its previous file, so one flaky API never breaks the build.
import { readFile, writeFile } from "node:fs/promises";
import { type Block, GAMES, type GameName, parseGame, readmeUrl } from "../src/lib/readme.ts";

const ORG = "0-draft";
const SKIP = new Set([".github", `${ORG}.github.io`]);
const DEVTO_USER = "kanywst";
const data = (file: string) => new URL(`../src/data/${file}`, import.meta.url);

const ghHeaders: Record<string, string> = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};
const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
if (token) ghHeaders.Authorization = `Bearer ${token}`;

// Links that reach the page from an API are kept only when they are plain https URLs.
function https(url: unknown, host?: string): string | null {
  try {
    const u = new URL(String(url));
    return u.protocol === "https:" && (!host || u.hostname === host) ? u.href : null;
  } catch {
    return null;
  }
}

async function get(url: string, headers: Record<string, string> = {}): Promise<Response> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res;
}

async function repos() {
  const all: any[] = [];
  for (let page = 1; ; page++) {
    const res = await get(`https://api.github.com/orgs/${ORG}/repos?type=public&per_page=100&page=${page}`, ghHeaders);
    const batch = await res.json();
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all
    .filter((r) => !r.archived && !r.fork && !r.private && !SKIP.has(r.name))
    .map((r) => ({
      name: r.name,
      description: r.description ?? "",
      url: r.html_url,
      homepage: https(r.homepage),
      language: r.language,
      topics: r.topics ?? [],
      stars: r.stargazers_count,
      createdAt: r.created_at,
      pushedAt: r.pushed_at,
    }))
    .sort((a, b) => b.pushedAt.localeCompare(a.pushedAt));
}

// Reads each board image's intrinsic size so the boards render at their final size from the start.
// Sizes are cosmetic: an image that can't be read just goes unsized instead of failing the sync.
async function sizeOf(src: string): Promise<{ w: number; h: number } | null> {
  try {
    const svg = await (await get(src)).text();
    const w = Number(svg.match(/<svg[^>]*\swidth="(\d+(?:\.\d+)?)"/)?.[1]);
    const h = Number(svg.match(/<svg[^>]*\sheight="(\d+(?:\.\d+)?)"/)?.[1]);
    return w && h ? { w, h } : null;
  } catch {
    return null;
  }
}

// Sizes the previous games.json already knew, so a transient fetch failure doesn't drop them.
async function knownSizes(): Promise<Map<string, { w: number; h: number }>> {
  const known = new Map<string, { w: number; h: number }>();
  try {
    const previous = JSON.parse(await readFile(data("games.json"), "utf8")) as Record<string, Block[]>;
    for (const blocks of Object.values(previous)) {
      for (const b of blocks) {
        if (b.kind !== "grid") continue;
        for (const c of b.rows.flat()) if (c.w && c.h) known.set(c.src, { w: c.w, h: c.h });
      }
    }
  } catch {
    // No previous file: everything is fetched.
  }
  return known;
}

async function sizeCells(blocks: Block[], known: Map<string, { w: number; h: number }>) {
  const cells = blocks.flatMap((b) => (b.kind === "grid" ? b.rows.flat() : []));
  const srcs = [...new Set(cells.map((c) => c.src))];
  const sizes = new Map(
    await Promise.all(srcs.map(async (src) => [src, (await sizeOf(src)) ?? known.get(src) ?? null] as const)),
  );
  for (const cell of cells) {
    const size = sizes.get(cell.src);
    if (size) Object.assign(cell, size);
  }
}

async function games() {
  const out: Record<string, Block[]> = {};
  const known = await knownSizes();
  for (const name of Object.keys(GAMES) as GameName[]) {
    const md = await (await get(readmeUrl(name))).text();
    const blocks = parseGame(name, md);
    if (!blocks?.length) throw new Error(`no live region in ${name}/README.md`);
    await sizeCells(blocks, known);
    out[name] = blocks;
  }
  return out;
}

async function articles() {
  const res = await get(`https://dev.to/api/articles?username=${DEVTO_USER}&per_page=8`);
  return (await res.json())
    .map((a: any) => ({
      title: a.title,
      url: https(a.url, "dev.to"),
      publishedAt: a.published_at,
      reactions: a.public_reactions_count ?? a.positive_reactions_count,
      tags: a.tag_list,
      readingMinutes: a.reading_time_minutes,
    }))
    .filter((a: { url: string | null }) => a.url);
}

let failed = 0;
for (const [file, load] of [
  ["repos.json", repos],
  ["games.json", games],
  ["articles.json", articles],
] as const) {
  try {
    const value = await load();
    // An empty answer is a failure too: an org rename or a token change must not empty the desk.
    if (Array.isArray(value) ? value.length === 0 : Object.keys(value).length === 0) {
      throw new Error("empty response");
    }
    await writeFile(data(file), `${JSON.stringify(value, null, 2)}\n`);
    console.log(`ok    ${file}`);
  } catch (err) {
    failed++;
    const kept = await readFile(data(file), "utf8").then(
      () => "kept the previous file",
      () => "and there is no previous file",
    );
    console.warn(`fail  ${file}: ${(err as Error).message} (${kept})`);
  }
}
if (failed === 3) process.exit(1);
