import { createHash } from "node:crypto";
import { readFileSync, readdirSync, lstatSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { Plugin } from "vite";

const moduleId = "virtual:academiccloud-pdf-assets";
const resolvedModuleId = "\0" + moduleId;
const devPrefix = "/@academiccloud-pdf-assets/";
const version = "6.2.108";
type Asset = { path: string; bytes: Buffer };
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

/** Preserve native PDF.js relative resource loading under one immutable URL. */
export function pdfAssetsPlugin(): Plugin {
  const require = createRequire(import.meta.url);
  const root = dirname(require.resolve("pdfjs-dist/package.json"));
  if (JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version !== version) throw new Error("Review PDF assets before upgrading PDF.js");
  let assets: Asset[] | undefined;
  let assetRoot = "";
  let development = false;
  const collect = () => {
    if (assets) return;
    const found: Asset[] = [];
    const add = (path: string, source = path) => {
      const file = join(root, source);
      const stat = lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Invalid PDF asset: " + path);
      found.push({ path, bytes: readFileSync(file) });
    };
    for (const directory of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
      for (const name of readdirSync(join(root, directory)).sort(compare)) {
        if (!/^[A-Za-z0-9_.-]+$/u.test(name)) throw new Error("Invalid PDF asset name");
        add(directory + "/" + name);
      }
    }
    add("pdf.worker.min.mjs", "build/pdf.worker.min.mjs");
    const notices = ["PDF.js " + version + "\n" + readFileSync(join(root, "LICENSE"), "utf8")];
    for (const asset of found.filter((entry) => entry.path.includes("/LICENSE"))) notices.push("\n=== " + asset.path + " ===\n" + asset.bytes.toString("utf8"));
    found.push({ path: "LICENSE.txt", bytes: Buffer.from(notices.join("\n")) });
    assets = found.sort((a, b) => compare(a.path, b.path));
    const hash = createHash("sha256");
    for (const asset of assets) hash.update(asset.path + "\0" + asset.bytes.length + "\0" + createHash("sha256").update(asset.bytes).digest("hex") + "\n");
    assetRoot = "pdfjs-" + version + "-" + hash.digest("hex");
  };
  return {
    name: "academiccloud-pdf-assets",
    configResolved(config) { development = config.command === "serve"; },
    resolveId(id) { if (id === moduleId) return resolvedModuleId; },
    load(id) {
      if (id !== resolvedModuleId) return;
      collect();
      let worker = "";
      for (const asset of assets!) {
        const ref = development ? undefined : this.emitFile({ type: "asset", fileName: "assets/" + assetRoot + "/" + asset.path, source: asset.bytes });
        if (asset.path === "pdf.worker.min.mjs") worker = development ? JSON.stringify(devPrefix + assetRoot + "/" + asset.path) : "import.meta.ROLLUP_FILE_URL_" + ref;
      }
      return "export const workerUrl = " + worker + ";\n" +
        Object.entries({ noticesUrl: "LICENSE.txt", cMapUrl: "cmaps/", standardFontDataUrl: "standard_fonts/", wasmUrl: "wasm/", iccUrl: "iccs/" })
          .map(([key, path]) => "export const " + key + " = new URL(" + JSON.stringify(path) + ", new URL(workerUrl, import.meta.url)).href;").join("\n");
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = request.url?.split("?")[0];
        if (!path?.startsWith(devPrefix)) return next();
        collect();
        const prefix = devPrefix + assetRoot + "/";
        const asset = path.startsWith(prefix) ? assets!.find((entry) => entry.path === path.slice(prefix.length)) : undefined;
        if (!asset) { response.statusCode = 404; response.end(); return; }
        const mime = /\.m?js$/u.test(asset.path) ? "text/javascript" : asset.path.endsWith(".wasm") ? "application/wasm" : asset.path.endsWith(".txt") ? "text/plain; charset=utf-8" : "application/octet-stream";
        response.setHeader("Content-Type", mime);
        response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        response.end(asset.bytes);
      });
    },
  };
}

