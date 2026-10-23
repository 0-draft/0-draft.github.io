import { describe, expect, it } from "vitest";
import { groups } from "../data/groups.ts";
import repos from "../data/repos.json";
import { ago, framable, labels, placed, type Repo, shelves } from "./desk.ts";

const DAY = 86_400_000;
const now = Date.parse("2026-10-24T00:00:00Z");
const before = (days: number) => new Date(now - days * DAY).toISOString();

describe("ago", () => {
  it.each([
    [0, "today"],
    [1, "yesterday"],
    [5, "5 days ago"],
    [31, "a month ago"],
    [95, "3 months ago"],
    [400, "a year ago"],
    [800, "2 years ago"],
  ])("%i days → %s", (days, text) => {
    expect(ago(before(days), now)).toBe(text);
  });
});

describe("framable", () => {
  const repo = (homepage: string | null) => ({ ...repos[0], homepage }) as Repo;

  it("frames sites on the org's Pages origin", () => {
    expect(framable(repo("https://0-draft.github.io/on-ramp/"))).toBe("https://0-draft.github.io/on-ramp/");
  });

  it("leaves everything else to a normal link", () => {
    expect(framable(repo("https://dev.to/kanywst"))).toBeNull();
    expect(framable(repo("https://0-draft.github.io.evil.example/"))).toBeNull();
    expect(framable(repo(null))).toBeNull();
  });
});

describe("shelves", () => {
  const all = shelves();
  const placed = all.flatMap((s) => s.repos.map((r) => r.name));

  it("puts every synced repo on the desk exactly once", () => {
    expect([...placed].sort()).toEqual(repos.map((r) => r.name).sort());
  });

  it("keeps the curated order inside each group", () => {
    for (const g of groups) {
      const shelf = all.find((s) => s.id === g.id);
      const synced = g.repos.filter((name) => repos.some((r) => r.name === name));
      expect(shelf?.repos.map((r) => r.name) ?? []).toEqual(synced);
    }
  });

  it("gives every sheet a spot, a small tilt and a stamp variant, the same on every build", () => {
    const again = shelves();
    for (const [i, shelf] of all.entries()) {
      for (const [j, r] of shelf.repos.entries()) {
        expect(Number.isFinite(r.spot.x) && Number.isFinite(r.spot.y)).toBe(true);
        expect(Math.abs(r.tilt)).toBeLessThanOrEqual(1.6);
        expect([0, 1, 2]).toContain(r.variant);
        expect(again[i].repos[j]).toEqual(r);
      }
    }
  });

  it("does not stack two sheets on the same spot", () => {
    const spots = all.flatMap((s) => s.repos.map((r) => `${r.spot.x},${r.spot.y}`));
    expect(new Set(spots).size).toBe(spots.length);
  });
});

describe("the hand-made layout", () => {
  it("has a heading spot for every group", () => {
    for (const g of groups) expect(labels[g.id], g.id).toBeDefined();
  });

  it("has a hand-placed spot for every filed repo", () => {
    for (const name of groups.flatMap((g) => g.repos)) expect(placed[name], name).toBeDefined();
  });

  it("puts the pile for unfiled repos below every other pile", () => {
    const lowest = Math.max(...Object.values(placed).map((s) => s.y));
    // The tallest sheet (the dev.to receipt) is about 1200px; leave room for it.
    expect(labels.fresh.y).toBeGreaterThan(lowest + 1200);
  });
});
