import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { performance } from "node:perf_hooks";

import { createCanvas, GlobalFonts } from "@napi-rs/canvas";

import {
  BibliographicIntelligenceError,
  deriveIntelligentBibliography,
  LlamaServerBibliographicReasoner,
} from "../src/bibliographic-intelligence.js";
import { PaddleOcrSidecarAdapter } from "../src/paddle-ocr.js";
import type { PdfTextInspection } from "../src/suggestion.js";

interface Case {
  id: string;
  lines: string[];
  vertical?: boolean;
  expectedTitle: string;
  expectedClass: string;
}

const CASES: Case[] = [
  {
    id: "modern-chinese",
    lines: ["题名：近代中国史研究", "作者：王明", "出版地：北京", "出版社：学术出版社", "出版日期：2026年"],
    expectedTitle: "近代中国史研究",
    expectedClass: "scholarly_monograph",
  },
  {
    id: "traditional-vertical",
    lines: ["書名資治通鑑", "撰者司馬光", "清乾隆十二年", "武英殿刻本"],
    vertical: true,
    expectedTitle: "資治通鑑",
    expectedClass: "traditional_book",
  },
  {
    id: "japanese-modern",
    lines: ["書名：近代日本史研究", "著者：山田太郎", "出版社：東京大学出版会", "出版年：2025年"],
    expectedTitle: "近代日本史研究",
    expectedClass: "scholarly_monograph",
  },
];

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function registerFont(): void {
  const font = process.env.BIBLIOGRAPHY_QUALIFICATION_FONT_PATH?.trim();
  if (!font || !GlobalFonts.registerFromPath(font, "AcademicCloud Qualification CJK")) {
    throw new Error("qualification CJK font is unavailable");
  }
}

function render(item: Case): Uint8Array {
  const canvas = createCanvas(1200, 1500);
  const context = canvas.getContext("2d");
  context.fillStyle = "#fffdf7";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#111111";
  context.textBaseline = "top";
  context.font = "58px 'AcademicCloud Qualification CJK'";
  if (item.vertical) {
    item.lines.forEach((line, column) => {
      const x = 980 - column * 190;
      [...line].forEach((character, row) => context.fillText(character, x, 100 + row * 76));
    });
  } else {
    item.lines.forEach((line, index) => context.fillText(line, 80, 120 + index * 150));
  }
  return new Uint8Array(canvas.toBuffer("image/png"));
}

function allocatePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForServer(origin: string): Promise<void> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${origin}/health`)).ok) return;
    } catch {
      // The bounded local server is still loading its exact model.
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("visual reasoner startup timeout");
}

const VISUAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["canonicalTitle", "materialClass"],
  properties: {
    canonicalTitle: { anyOf: [{ type: "string" }, { type: "null" }] },
    materialClass: { type: "string", enum: ["scholarly_monograph", "traditional_book", "unknown"] },
  },
} as const;

async function directVisual(images: Map<string, Uint8Array>): Promise<Map<string, { title: string | null; materialClass: string }>> {
  const port = await allocatePort();
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(required("BIBLIOGRAPHY_LLAMA_SERVER_PATH"), [
    "--model", required("BIBLIOGRAPHY_QWEN_VL_MODEL_PATH"),
    "--mmproj", required("BIBLIOGRAPHY_QWEN_VL_MMPROJ_PATH"),
    "--host", "127.0.0.1", "--port", String(port), "--ctx-size", "4096",
    "--threads", "2", "--parallel", "1", "--no-webui", "--log-disable",
  ], { shell: false, stdio: ["ignore", "ignore", "pipe"], env: { PATH: process.env.PATH, LANG: "C.UTF-8", LC_ALL: "C.UTF-8" } });
  child.stderr.on("data", () => undefined);
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  try {
    await Promise.race([waitForServer(origin), exited.then(() => { throw new Error("visual reasoner exited"); })]);
    const results = new Map<string, { title: string | null; materialClass: string }>();
    for (const item of CASES) {
      const image = images.get(item.id)!;
      const response = await fetch(`${origin}/v1/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "Qwen3-VL-2B-Instruct-GGUF",
          temperature: 0,
          seed: 0,
          max_tokens: 128,
          messages: [{ role: "user", content: [
            { type: "text", text: "Read only the visible bibliographic page. Return its exact title and material class. Use unknown when unsupported. Return JSON only." },
            { type: "image_url", image_url: { url: `data:image/png;base64,${Buffer.from(image).toString("base64")}` } },
          ] }],
          response_format: { type: "json_schema", json_schema: { name: "visual_bibliography_probe", strict: true, schema: VISUAL_SCHEMA } },
        }),
        signal: AbortSignal.timeout(180_000),
      });
      if (!response.ok) throw new Error("visual reasoner request failed");
      const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      const content = payload.choices?.[0]?.message?.content;
      if (!content) throw new Error("visual reasoner response missing");
      const parsed = JSON.parse(content) as { canonicalTitle: string | null; materialClass: string };
      results.set(item.id, { title: parsed.canonicalTitle, materialClass: parsed.materialClass });
    }
    return results;
  } finally {
    child.kill("SIGKILL");
    await exited;
  }
}

let qualificationStage = "startup";

function boundedDiagnostic(error: unknown): string {
  if (error instanceof BibliographicIntelligenceError) return `${error.code}:${error.diagnostic}`;
  if (error instanceof TypeError) {
    return `contract:${error.message.replace(/[^A-Za-z0-9 ._\[\]-]/gu, "_").slice(0, 160)}`;
  }
  if (error instanceof Error) {
    if (error.message === "PaddleOCR representative sample failed") return "ocr_sample_failed";
    if (error.message === "qualification CJK font is unavailable") return "font_unavailable";
    return error.name || "error";
  }
  return "unknown_error";
}

async function main(): Promise<void> {
qualificationStage = "render";
registerFont();
const images = new Map(CASES.map((item) => [item.id, render(item)]));
const pipelineStarted = performance.now();
const ocr = new PaddleOcrSidecarAdapter();
const inspections = new Map<string, PdfTextInspection>();
try {
  qualificationStage = "pipeline_ocr";
  for (const item of CASES) {
    const recognized = await ocr.recognizePage({ imageBytes: images.get(item.id)!, pageIndex: 1 });
    inspections.set(item.id, {
      pageCount: 1,
      pageIndices: [1],
      pages: [{ pageIndex: 1, text: recognized.text, evidenceOrigin: "ocr", ocrEngine: recognized.engine, ocrConfidence: recognized.confidence }],
      embeddedMetadata: {},
      complete: true,
      hasUsableTextLayer: false,
    });
    if (recognized.status !== "recognized") throw new Error("PaddleOCR representative sample failed");
  }
} finally {
  await ocr.close();
}
const reasoner = new LlamaServerBibliographicReasoner();
const pipelineResults = new Map<string, { title: string | null; materialClass: string; status: string }>();
try {
  qualificationStage = "pipeline_reasoning";
  for (const item of CASES) {
    const result = await deriveIntelligentBibliography(inspections.get(item.id)!, reasoner);
    pipelineResults.set(item.id, { title: result.canonical?.canonicalTitle ?? null, materialClass: result.canonical?.materialClass ?? "unknown", status: result.status });
  }
} finally {
  await reasoner.close();
}
const pipelineMilliseconds = Math.round(performance.now() - pipelineStarted);

const visualStarted = performance.now();
let visualResults = new Map<string, { title: string | null; materialClass: string }>();
let visualCompleted = true;
try {
  qualificationStage = "direct_visual";
  visualResults = await directVisual(images);
} catch {
  visualCompleted = false;
}
const visualMilliseconds = Math.round(performance.now() - visualStarted);

const outcomes = CASES.map((item) => {
  const pipeline = pipelineResults.get(item.id)!;
  const visual = visualResults.get(item.id);
  return {
    id: item.id,
    pipeline: {
      valid: true,
      titleMatch: pipeline.title === item.expectedTitle,
      classMatch: pipeline.materialClass === item.expectedClass,
      status: pipeline.status,
    },
    directVisual: {
      completed: visual !== undefined,
      titleMatch: visual?.title === item.expectedTitle,
      classMatch: visual?.materialClass === item.expectedClass,
    },
  };
});
const pipelinePassed = outcomes.filter((entry) => entry.pipeline.titleMatch && entry.pipeline.classMatch).length;
const visualPassed = outcomes.filter((entry) => entry.directVisual.titleMatch && entry.directVisual.classMatch).length;
process.stdout.write(`${JSON.stringify({
  status: pipelinePassed === CASES.length ? "ok" : "failed",
  selectedArchitecture: "pp-ocrv6-small-then-qwen3-1.7b",
  pipelinePassed,
  visualPassed,
  total: CASES.length,
  visualCompleted,
  pipelineMilliseconds,
  visualMilliseconds,
  outcomes,
})}\n`);
if (pipelinePassed !== CASES.length) process.exitCode = 1;
}

await main().catch((error: unknown) => {
  process.stdout.write(`${JSON.stringify({
    status: "diagnostic",
    stage: qualificationStage,
    code: boundedDiagnostic(error),
  })}\n`);
  process.exitCode = 1;
});
