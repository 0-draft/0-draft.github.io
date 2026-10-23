// @ts-check
import { defineConfig, fontProviders } from "astro/config";

export default defineConfig({
  site: "https://0-draft.github.io",
  fonts: [
    {
      provider: fontProviders.google(),
      name: "Archivo",
      cssVariable: "--font-sans",
      weights: [400, 500, 700, 800, 900],
      subsets: ["latin"],
      fallbacks: ["Helvetica Neue", "Arial", "sans-serif"],
    },
    {
      provider: fontProviders.google(),
      name: "Martian Mono",
      cssVariable: "--font-mono",
      weights: [400, 500],
      subsets: ["latin"],
      fallbacks: ["ui-monospace", "monospace"],
    },
  ],
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' https://raw.githubusercontent.com",
        "connect-src 'self' https://raw.githubusercontent.com",
        "frame-src https://0-draft.github.io",
        "object-src 'none'",
        "font-src 'self'",
        "base-uri 'none'",
        "form-action 'none'",
      ],
    },
  },
});
