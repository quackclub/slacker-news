import path from "node:path";
import { fileURLToPath } from "node:url";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { richTextEditor } from "./src/lib/richTextEditor";
import { buildConfig } from "payload";
import { Posts } from "./src/collections/Posts.ts";
import { Users } from "./src/collections/Users.ts";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

const adminURL = process.env.PAYLOAD_URL ?? "http://localhost:3000";
const astroURL = process.env.ASTRO_URL ?? "http://localhost:4321";

export default buildConfig({
  secret: process.env.PAYLOAD_SECRET ?? "change-me-in-production",
  serverURL: adminURL,
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: dirname
    }
  },
  collections: [Users, Posts],
  editor: richTextEditor,
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URI
    }
  }),
  cors: ["http://localhost:3000", astroURL],
  csrf: [adminURL, astroURL],
  typescript: {
    outputFile: path.resolve(dirname, "src/payload-types.ts")
  }
});
