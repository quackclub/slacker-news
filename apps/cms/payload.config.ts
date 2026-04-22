import path from "node:path";
import { fileURLToPath } from "node:url";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { buildConfig } from "payload";
import { Posts } from "./src/collections/Posts.ts";
import { Users } from "./src/collections/Users.ts";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

export default buildConfig({
  secret: process.env.PAYLOAD_SECRET ?? "change-me-in-production",
  serverURL: process.env.PAYLOAD_URL ?? "http://localhost:3000",
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: dirname
    }
  },
  collections: [Users, Posts],
  editor: lexicalEditor({}),
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URI
    }
  }),
  cors: [process.env.ASTRO_URL ?? "http://localhost:4321"],
  csrf: [process.env.ASTRO_URL ?? "http://localhost:4321"],
  typescript: {
    outputFile: path.resolve(dirname, "src/payload-types.ts")
  }
});
