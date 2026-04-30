import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import db from "@astrojs/db";
import node from "@astrojs/node";
import { legacyRedirects } from "./src/data/legacy-redirects.mjs";

export default defineConfig({
    site: "https://news.hackclub.com",
    output: "server",
    adapter: node({ mode: "standalone" }),
    integrations: [mdx(), db()],
    image: {
        domains: ["cdn.hackclub.com", "user-cdn.hackclub-assets.com"]
    },
    redirects: legacyRedirects
});
