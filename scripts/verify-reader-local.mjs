import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cache = join(process.env.LOCALAPPDATA ?? process.env.LocalAppData ?? join(homedir(), "AppData", "Local"), "npm-cache", "_npx");
function cachedTool(packagePath, version, entry) {
  for (const dir of readdirSync(cache, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const base = join(cache, dir.name, "node_modules", packagePath);
    try { if (JSON.parse(readFileSync(join(base, "package.json"), "utf8")).version === version) return join(base, entry); } catch {}
  }
  throw new Error("Required cached tool " + packagePath + "@" + version + " is missing; install through approved registry before verifying.");
}
const run = (args, cwd = root) => execFileSync(process.execPath, args, { cwd, stdio: "inherit", env: process.env });
switch (process.argv[2] ?? "versions") {
  case "versions": run(["--version"]); run([cachedTool("npm", "11.19.1", "bin/npm-cli.js"), "--version"]); break;
  case "ui": run(["../node_modules/vitest/vitest.mjs", "run", "src/workspace.test.tsx", "src/App.test.tsx", "-t", "private workspace|document preview session|preview|Preview|reading title"], join(root, "frontend")); break;
  case "assets": run(["--import", "tsx", "--test", "backend/test/deployment/public-assets.test.ts"]); break;
  case "browser": run([cachedTool("@playwright/cli", "0.1.21", "playwright-cli.js"), "list"]); break;
  default: throw new Error("Choose versions, ui, assets, or browser");
}
