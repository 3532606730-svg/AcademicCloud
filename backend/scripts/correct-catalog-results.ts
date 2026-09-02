import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { correctReviewedCatalogResults } from "../src/catalog-batch/reviewed-results.js";

const [inputArgument, outputArgument] = process.argv.slice(2);
if (!inputArgument || !outputArgument) {
  throw new TypeError("usage: correct-catalog-results <input.json> <new-output.json>");
}
const inputPath = resolve(inputArgument);
const outputPath = resolve(outputArgument);
if (inputPath === outputPath) throw new TypeError("corrected output must not overwrite the input document");
const input = JSON.parse(await readFile(inputPath, "utf8")) as unknown;
const corrected = correctReviewedCatalogResults(input);
await writeFile(outputPath, `${JSON.stringify(corrected.document, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
process.stdout.write(`${JSON.stringify({ inputPath, outputPath, ...corrected.report }, null, 2)}\n`);
