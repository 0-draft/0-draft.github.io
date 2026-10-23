// Hand-curated shelves. Any synced repo not listed here lands in the fallback shelf,
// so a new repo shows up on the next build even before it is filed.
export interface Group {
  id: string;
  title: string;
  blurb: string;
  repos: string[];
}

export const groups: Group[] = [
  {
    id: "aws",
    title: "AWS, drawn",
    blurb: "Interactive maps of how AWS actually works, from credentials to cables. English and Japanese.",
    repos: ["caller-identity", "assume-role", "on-ramp", "cross-connect", "s3-atlas"],
  },
  {
    id: "security",
    title: "Identity & security",
    blurb: "Policy engines side by side, standards worth watching, and one zero-day taken apart.",
    repos: ["authz-playground", "identity-deep-dive", "php2shell-anatomy"],
  },
  {
    id: "games",
    title: "Played in the README",
    blurb: "Open an issue to make a move. GitHub Actions deals the cards and redraws the board.",
    repos: ["blackjack", "shogi", "guestbook"],
  },
  {
    id: "writing",
    title: "Writing",
    blurb: "Where the deep dives end up as articles.",
    repos: ["dev.to"],
  },
];

export const fallback: Omit<Group, "repos"> = {
  id: "fresh",
  title: "Just out of the oven",
  blurb: "New here and not filed yet.",
};
