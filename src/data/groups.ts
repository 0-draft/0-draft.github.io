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
    repos: ["aws-credentials", "aws-connectivity", "s3-atlas"],
  },
  {
    id: "security",
    title: "Identity & security",
    blurb:
      "Policy engines side by side, standards worth watching, a zero-day taken apart, and how attackers get in and stay hidden.",
    repos: [
      "authz-playground",
      "identity-deep-dive",
      "vpn-is-the-door",
      "php2shell-anatomy",
      "why-hackers-dont-get-caught",
    ],
  },
  {
    id: "games",
    title: "Played in the README",
    blurb: "Open an issue to place a bet or make a move. GitHub Actions deals the cards and redraws the table.",
    repos: ["casino"],
  },
  {
    id: "writing",
    title: "Writing",
    blurb: "Where the deep dives end up as articles.",
    repos: ["dev.to"],
  },
  {
    id: "culture",
    title: "Words & ways",
    blurb: "Japanese words worth using, and how engineers in other countries think and work. English and Japanese.",
    repos: ["goi", "wtfe"],
  },
  {
    id: "tools",
    title: "Tools",
    blurb: "Runs on your own machine.",
    repos: ["ccretro"],
  },
];

export const fallback: Omit<Group, "repos"> = {
  id: "fresh",
  title: "Just out of the oven",
  blurb: "New here and not filed yet.",
};
