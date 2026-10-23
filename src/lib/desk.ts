// Where everything sits on the mat, in world pixels. The home sheet is centred on (0, 0).
// Positions are top-left corners; sizes come from the rendered elements, so only placement lives here.
import { fallback, groups } from "../data/groups.ts";
import repos from "../data/repos.json";

export type Repo = (typeof repos)[number];

export interface Spot {
  x: number;
  y: number;
}

export const home: Spot = { x: -680, y: -330 };

// Hand-placed so each group reads as one pile on the desk.
const placed: Record<string, Spot> = {
  "caller-identity": { x: -2860, y: -1600 },
  "assume-role": { x: -2180, y: -1540 },
  "on-ramp": { x: -1500, y: -1620 },
  "cross-connect": { x: -2560, y: -860 },
  "s3-atlas": { x: -1860, y: -820 },
  "authz-playground": { x: 880, y: -1600 },
  "identity-deep-dive": { x: 1560, y: -1540 },
  "php2shell-anatomy": { x: 1220, y: -860 },
  blackjack: { x: -1620, y: 820 },
  shogi: { x: -900, y: 780 },
  guestbook: { x: -240, y: 880 },
  "dev.to": { x: 860, y: 780 },
};

export const labels: Record<string, Spot> = {
  aws: { x: -2860, y: -1920 },
  security: { x: 880, y: -1920 },
  games: { x: -1620, y: 490 },
  writing: { x: 860, y: 470 },
  fresh: { x: 900, y: 1500 },
};

// Red string between sheets that belong together across piles: the same subject,
// or a project and the article written about it. Pairs naming a missing repo are skipped.
export const threads: [string, string][] = [
  ["caller-identity", "assume-role"],
  ["assume-role", "identity-deep-dive"],
  ["on-ramp", "cross-connect"],
  ["authz-playground", "dev.to"],
  ["identity-deep-dive", "dev.to"],
  ["shogi", "dev.to"],
];

// Dossier numbers are primes, for anyone who notices.
const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31];
export const fileNo = (i: number) => `File ${String(PRIMES[i] ?? i + 1).padStart(2, "0")}`;

export interface Shelf {
  id: string;
  title: string;
  blurb: string;
  label: Spot;
  repos: (Repo & { spot: Spot; tilt: number; tape: number })[];
}

// Same name, same tilt and tape, every build.
function hash(s: string): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) / 2 ** 32;
}

function dress(r: Repo, spot: Spot) {
  const n = hash(r.name);
  return { ...r, spot, tilt: Math.round((n * 3.2 - 1.6) * 10) / 10, tape: Math.floor(n * 1000) % 3 };
}

export function shelves(): Shelf[] {
  const byName = new Map(repos.map((r) => [r.name, r]));
  const filed = new Set(groups.flatMap((g) => g.repos));
  const out: Shelf[] = groups.map((g) => ({
    ...g,
    label: labels[g.id],
    repos: g.repos.flatMap((name) => {
      const r = byName.get(name);
      return r ? [dress(r, placed[name] ?? labels[g.id])] : [];
    }),
  }));
  const fresh = repos.filter((r) => !filed.has(r.name));
  if (fresh.length) {
    out.push({
      ...fallback,
      label: labels.fresh,
      repos: fresh.map((r, i) => dress(r, { x: labels.fresh.x + i * 700, y: labels.fresh.y + 260 })),
    });
  }
  return out.filter((s) => s.repos.length > 0);
}

export function ago(iso: string, now = Date.now()): string {
  const days = Math.floor((now - Date.parse(iso)) / 86_400_000);
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? "a month ago" : `${months} months ago`;
  const years = Math.floor(months / 12);
  return years === 1 ? "a year ago" : `${years} years ago`;
}

// Sites under the same Pages origin can be framed; anything else opens in a new tab.
export function framable(r: Repo): string | null {
  return r.homepage?.startsWith("https://0-draft.github.io/") ? r.homepage : null;
}
