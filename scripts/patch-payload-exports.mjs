import fs from "fs/promises";
import path from "path";

const bunDir = path.join(process.cwd(), "node_modules", ".bun");

async function patchPayloadPackage(packageDir) {
  const pkgPath = path.join(packageDir, "node_modules", "payload", "package.json");

  let pkgJson;
  try {
    const raw = await fs.readFile(pkgPath, "utf8");
    pkgJson = JSON.parse(raw);
  } catch {
    return;
  }

  const exportsField = pkgJson.exports ?? {};
  let updated = false;

  const extensions = {
    "./database": {
      import: "./dist/database/index.js",
      types: "./dist/database/index.d.ts",
      default: "./dist/database/index.js",
    },
    "./errors": {
      import: "./dist/errors/index.js",
      types: "./dist/errors/index.d.ts",
      default: "./dist/errors/index.js",
    },
    "./types": {
      import: "./dist/types/index.js",
      types: "./dist/types/index.d.ts",
      default: "./dist/types/index.js",
    },
    "./versions": {
      import: "./dist/versions/index.js",
      types: "./dist/versions/index.d.ts",
      default: "./dist/versions/index.js",
    },
    "./utilities": {
      import: "./dist/utilities/index.js",
      types: "./dist/utilities/index.d.ts",
      default: "./dist/utilities/index.js",
    },
    "./config": {
      import: "./dist/config/index.js",
      types: "./dist/config/index.d.ts",
      default: "./dist/config/index.js",
    },
     "./bin": {
       import: "./dist/bin/index.js",
       types: "./dist/bin/index.d.ts",
       default: "./dist/bin/index.js",
     },
  };

  for (const [key, value] of Object.entries(extensions)) {
    if (!exportsField[key]) {
      exportsField[key] = value;
      updated = true;
    }
  }

  if (updated) {
    pkgJson.exports = exportsField;
    await fs.writeFile(pkgPath, `${JSON.stringify(pkgJson, null, 2)}\n`);
  }
}

async function ensureDirectoryIndex(packageDir, dirName) {
  const dirPath = path.join(
    packageDir,
    "node_modules",
    "payload",
    "dist",
    dirName
  );

  const indexJs = path.join(dirPath, "index.js");
  const indexDts = path.join(dirPath, "index.d.ts");

  const jsContent = 'export * from "../index.js";\n';
  const dtsContent = 'export * from "../index.d.ts";\n';

  await fs.mkdir(dirPath, { recursive: true });
  await fs.writeFile(indexJs, jsContent);
  await fs.writeFile(indexDts, dtsContent);
}

async function ensureDatabaseModule(packageDir) {
  const databaseDir = path.join(
    packageDir,
    "node_modules",
    "payload",
    "dist",
    "database"
  );

  const indexJs = path.join(databaseDir, "index.js");
  const indexDts = path.join(databaseDir, "index.d.ts");

  await fs.mkdir(databaseDir, { recursive: true });

  const jsContent = 'export { createDatabaseAdapter } from "./createDatabaseAdapter.js";\n';
  const dtsContent = 'export * from "./types.js";\nexport { createDatabaseAdapter } from "./createDatabaseAdapter.js";\n';

  await fs.writeFile(indexJs, jsContent);
  await fs.writeFile(indexDts, dtsContent);
}

async function run() {
  try {
    const entries = await fs.readdir(bunDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (!entry.name.startsWith("payload@")) continue;

      const packageDir = path.join(bunDir, entry.name);
      await patchPayloadPackage(packageDir);
      await ensureDatabaseModule(packageDir);
      await ensureDirectoryIndex(packageDir, "config");
      await ensureDirectoryIndex(packageDir, "utilities");
      await ensureDirectoryIndex(packageDir, "versions");
    }
  } catch (error) {
    console.error("patch-payload-exports:", error);
  }
}

await run();
