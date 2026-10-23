# 0-draft.github.io

<img alt="The 0-draft desk" src="public/og.png">

Everything public in the [0-draft](https://github.com/0-draft) org, laid out on a cutting mat at <https://0-draft.github.io/>.

Drag the mat to look around and pinch (or press `+` and `-`) to zoom. A sheet with a red "Try it here" sticker opens the real site right on the desk. Blackjack, shogi and the guest book are read live from their READMEs, so you can make a move from here. Prefer a plain page? Press "List view".

## How it works

- `scripts/sync.ts` pulls the org's public repos (archived repos and forks are left out), the live region of each README game, and the latest dev.to articles into `src/data/`. A source that fails keeps its previous file.
- `src/data/groups.ts` decides which pile a repo sits in. A new repo that isn't filed there shows up on its own pile on the next build.
- `src/lib/desk.ts` holds where each sheet sits on the mat. `src/scripts/desk.ts` is the camera: pan, zoom, rulers, minimap and the live frame. It has no dependencies.
- `src/assets/shots/` holds a screenshot per project, named after the repo.
- `.github/workflows/deploy.yml` syncs, checks, builds and deploys to Pages on every push and once a day.

## Develop

```sh
pnpm install
pnpm sync      # needs network; set GITHUB_TOKEN to avoid rate limits
pnpm dev
pnpm check     # biome + astro check
pnpm build
```

Astro 7, plain CSS, Node 24 or newer.

## Adding a repo

1. Add its name to a group in `src/data/groups.ts`.
2. Give it a spot in `src/lib/desk.ts`.
3. Drop a 1280×800 screenshot at `src/assets/shots/<repo>.png`.
