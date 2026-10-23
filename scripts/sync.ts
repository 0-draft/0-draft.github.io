// Refreshes everything the site reads at build time:
//   src/data/repos.json     public, unarchived, non-fork repos of the org
//   src/data/games.json     the live board of each README game
//   src/data/articles.json  latest dev.to articles
// A source that fails keeps its previous file, so one flaky API never breaks the build.
import { readFile, writeFile } from "node:fs/promises";
import { GAMES, type GameName, parseGame, readmeUrl } from "../src/lib/readme.ts";

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
      homepage: r.homepage || null,
      language: r.language,
      topics: r.topics ?? [],
      stars: r.stargazers_count,
      createdAt: r.created_at,
      pushedAt: r.pushed_at,
    }))
    .sort((a, b) => b.pushedAt.localeCompare(a.pushedAt));
}

async function games() {
  const out: Record<string, unknown> = {};
  for (const name of Object.keys(GAMES) as GameName[]) {
    const md = await (await get(readmeUrl(name))).text();
    const blocks = parseGame(name, md);
    if (!blocks) throw new Error(`no live region in ${name}/README.md`);
    out[name] = blocks;
  }
  return out;
}

async function articles() {
  const res = await get(`https://dev.to/api/articles?username=${DEVTO_USER}&per_page=8`);
  return (await res.json()).map((a: any) => ({
    title: a.title,
    url: a.url,
    publishedAt: a.published_at,
    reactions: a.public_reactions_count ?? a.positive_reactions_count,
    tags: a.tag_list,
    readingMinutes: a.reading_time_minutes,
  }));
}

let failed = 0;
for (const [file, load] of [
  ["repos.json", repos],
  ["games.json", games],
  ["articles.json", articles],
] as const) {
  try {
    const value = await load();
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
