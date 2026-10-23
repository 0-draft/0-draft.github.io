// @ts-check
import { defineConfig, fontProviders } from "astro/config";

export default defineConfig({
  site: "https://0-draft.github.io",
  fonts: [
    {
      provider: fontProviders.google(),
      name: "M PLUS Rounded 1c",
      cssVariable: "--font-round",
      weights: [500, 800, 900],
      subsets: ["latin"],
      fallbacks: ["ui-rounded", "system-ui", "sans-serif"],
    },
    {
      provider: fontProviders.google(),
      name: "DotGothic16",
      cssVariable: "--font-dot",
      weights: [400],
      subsets: ["latin"],
      fallbacks: ["ui-monospace", "monospace"],
    },
  ],
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data: https://raw.githubusercontent.com https://avatars.githubusercontent.com",
        "connect-src 'self' https://raw.githubusercontent.com",
        "frame-src 'self' https://0-draft.github.io",
        "font-src 'self'",
        "base-uri 'none'",
        "form-action 'none'",
      ],
    },
  },
});
