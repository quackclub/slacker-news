import { buildConfig } from "payload";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { Posts } from "./collections/Posts";
import { Users } from "./collections/Users";

export default buildConfig({
  secret: process.env.PAYLOAD_SECRET ?? "change-me-in-production",
  serverURL: process.env.PAYLOAD_URL ?? "http://localhost:3000",

  admin: {
    user: Users.slug,
  },

  collections: [Users, Posts],

  editor: lexicalEditor({}),

  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URI,
    },
  }),

  cors: [process.env.ASTRO_URL ?? "http://localhost:4321"],
  csrf: [process.env.ASTRO_URL ?? "http://localhost:4321"],

    bin: [
      {
        key: "dev",
        scriptPath: new URL("./dev.ts", import.meta.url).pathname,
      },
    ],
});
