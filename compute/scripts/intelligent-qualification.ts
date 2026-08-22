import {
  BibliographicIntelligenceError,
  deriveIntelligentBibliography,
  LlamaServerBibliographicReasoner,
} from "../src/bibliographic-intelligence.js";
import type { PdfTextInspection } from "../src/suggestion.js";

interface QualificationCase {
  id: string;
  text: string;
  expectedTitle: string;
  expectedClass: string;
  expectedStatus: "auto_apply" | "not_auto";
  carrierEditionType?: string;
  sourceDynasty?: string;
}

const CASES: QualificationCase[] = [
  {
    id: "chinese-modern-monograph",
    text: "题名：近代中国史研究\n作者：王明\n出版地：北京\n出版社：学术出版社\n出版日期：2026年",
    expectedTitle: "近代中国史研究",
    expectedClass: "scholarly_monograph",
    expectedStatus: "auto_apply",
  },
  {
    id: "japanese-monograph",
    text: "書名：近代日本史研究\n著者：山田太郎\n出版社：東京大学出版会\n出版年：2025年",
    expectedTitle: "近代日本史研究",
    expectedClass: "scholarly_monograph",
    expectedStatus: "auto_apply",
  },
  {
    id: "modern-edited-source",
    text: "题名：清代档案选编\n编者：李文\n点校本\n出版社：中华书局\n出版日期：2024年",
    expectedTitle: "清代档案选编",
    expectedClass: "primary_source_modern_edition",
    expectedStatus: "auto_apply",
  },
  {
    id: "modern-facsimile",
    text: "题名：宋刻本影印集\n编者：赵青\n现代载体版本：影印本\n影印说明：据国家图书馆藏宋刻本影印\n出版社：古籍出版社\n出版日期：2023年",
    expectedTitle: "宋刻本影印集",
    expectedClass: "primary_source_modern_edition",
    expectedStatus: "auto_apply",
    carrierEditionType: "facsimile",
  },
  {
    id: "traditional-vertical",
    text: "書名：資治通鑑\n撰者：司馬光\n歷史源版本：清乾隆十二年武英殿刻本\n版式：繁體直排",
    expectedTitle: "資治通鑑",
    expectedClass: "traditional_book",
    expectedStatus: "auto_apply",
    sourceDynasty: "清",
  },
  {
    id: "journal-article",
    text: "文章题名：边疆史研究的新进展\n作者：陈新\n刊名：历史研究\n2025年第3期\n页码：45-67",
    expectedTitle: "边疆史研究的新进展",
    expectedClass: "journal_article",
    expectedStatus: "auto_apply",
  },
  {
    id: "ambiguous-conflict",
    text: "封面题名：历史研究\n题名页题名：历史学研究\n作者不详\n两处主要题名冲突，无法确认权威题名",
    expectedTitle: "历史研究",
    expectedClass: "unknown",
    expectedStatus: "not_auto",
  },
];

function inspection(text: string): PdfTextInspection {
  return {
    pageCount: 1,
    pageIndices: [1],
    pages: [{ pageIndex: 1, text, evidenceOrigin: "native_text", ocrEngine: null, ocrConfidence: null }],
    embeddedMetadata: {},
    complete: true,
    hasUsableTextLayer: true,
  };
}

const reasoner = new LlamaServerBibliographicReasoner();
const outcomes: Array<{ id: string; passed: boolean; status: string; confidence: number; warningCodes: string[]; diagnostic?: string; titleOkay?: boolean; classOkay?: boolean; carrierOkay?: boolean; sourceOkay?: boolean }> = [];

function boundedDiagnostic(error: unknown): string {
  if (error instanceof BibliographicIntelligenceError) return `${error.code}:${error.diagnostic}`;
  if (error instanceof TypeError) return `contract:${error.message.replace(/[^A-Za-z0-9 ._\[\]-]/gu, "_").slice(0, 160)}`;
  return error instanceof Error ? (error.name || "error") : "unknown_error";
}

try {
  for (const item of CASES) {
    try {
      const result = await deriveIntelligentBibliography(inspection(item.text), reasoner);
      const titleOkay = item.expectedStatus === "not_auto"
        ? true
        : result.canonical?.canonicalTitle === item.expectedTitle;
      const classOkay = item.expectedStatus === "not_auto"
        ? true
        : result.canonical?.materialClass === item.expectedClass;
      const carrierOkay = item.carrierEditionType === undefined || result.canonical?.carrierEdition.editionType === item.carrierEditionType;
      const sourceOkay = item.sourceDynasty === undefined || result.canonical?.sourceEdition.dynasty === item.sourceDynasty;
      outcomes.push({
        id: item.id,
        passed: (item.expectedStatus === "not_auto" ? result.status !== "auto_apply" : result.status === item.expectedStatus)
          && titleOkay && classOkay && carrierOkay && sourceOkay,
        status: result.status,
        confidence: result.overallConfidence,
        warningCodes: [...result.warnings],
        titleOkay,
        classOkay,
        carrierOkay,
        sourceOkay,
      });
    } catch (error: unknown) {
      outcomes.push({
        id: item.id,
        passed: false,
        status: "error",
        confidence: 0,
        warningCodes: [],
        diagnostic: boundedDiagnostic(error),
      });
    }
  }
} finally {
  await reasoner.close();
}

const passed = outcomes.filter((entry) => entry.passed).length;
process.stdout.write(`${JSON.stringify({ status: passed === CASES.length ? "ok" : "failed", passed, total: CASES.length, outcomes })}\n`);
if (passed !== CASES.length) process.exitCode = 1;
