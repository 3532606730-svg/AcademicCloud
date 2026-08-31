import {
  BibliographicIntelligenceError,
  deriveIntelligentBibliography,
  LlamaServerBibliographicReasoner,
  NUEXTRACT_REASONING_MODEL,
} from "../src/bibliographic-intelligence.js";
import type { PdfTextInspection } from "../src/suggestion.js";

interface QualificationCase {
  id: "modern-a" | "historical-b1" | "historical-b2" | "insufficient-unknown";
  pages: string[];
  expectedTitle: string;
  expectedClass: "scholarly_monograph" | "primary_source_modern_edition" | "unknown";
}

const CASES: QualificationCase[] = [
  {
    id: "modern-a",
    pages: [
      "书名：北方民族史研究\n作者：王明\n出版地：北京\n出版社：学术出版社\n出版日期：2026年",
      "前言\n本书是一部现代学术专著，系统分析北方民族历史的制度变迁、社会结构与跨区域交流，并依据史料提出新的解释。全书比较不同时期的政治制度、经济联系、宗教网络与知识生产，讨论历史叙述中的连续性和断裂。各章综合档案、碑刻、地方志与既有研究，辨析材料的形成背景和解释边界。作者围绕区域互动提出可检验的分析框架，并说明章节之间的论证关系、研究方法与学术贡献。这是一项针对历史问题的现代分析研究，而不是历史原始文献的整理、翻译或影印。结论进一步比较不同解释路径的证据基础，说明本研究如何修正旧有观点，并提出可以由后续史料继续检验的问题。",
    ],
    expectedTitle: "北方民族史研究",
    expectedClass: "scholarly_monograph",
  },
  {
    id: "historical-b1",
    pages: [
      "书名：真腊风土记\n校注者：李明\n版本：校注本\n出版社：古籍出版社\n出版日期：2024年",
      "序言\n《真腊风土记》是元代周达观亲历真腊后撰写的历史文献，本书保存其原文并呈现当时地理、制度与风俗记录。原文依次记述城郭、宫室、服饰、语言、贸易、宗教与岁时生活，保留作者观察到的十三世纪末真腊社会状况。本文献的叙述主体、事件记录与见闻均属于历史原始作品，而非现代作者围绕历史问题写成的分析专著。本版收录完整历史文本，现代序言仅用于说明文献流传、版本来源和阅读方式，不改变原始作品的性质。书中各条目仍依原作次序排列，读者所见主体是周达观的历史记载，现代说明不构成独立的分析论证。原作关于道路、水道、税赋、市场和礼俗的连续记载均按原文保存，注释与校记只说明词义、异文和历史背景，不能替代这些第一手见闻。",
      "校注说明\n本校注本以通行刻本为底本，参校诸本，逐条核对文字异同，校正明显讹误并对古代人名、地名、制度与物产作注。整理者说明底本、参校本和取舍原则，保留原文段落次序，不以现代论述替代历史文本。校注本还附有异文说明、专名索引和必要的版本记载，所有现代内容均服务于原始文献的整理与阅读。本校注本的版本身份有明确依据，属于历史史料的现代整理版本。凡改字、补字和异体字处理均列出校记，便于读者复核底本与参校本之间的差异。",
    ],
    expectedTitle: "真腊风土记",
    expectedClass: "primary_source_modern_edition",
  },
  {
    id: "historical-b2",
    pages: [
      "书名：蒙古秘史\n译注者：张华\n版本：译注本\n出版社：民族出版社\n出版日期：2023年",
      "导言\n《蒙古秘史》记录蒙古早期历史、谱系、征战、盟誓与政治事件，本版完整保留原始文献篇章并附现代译文。作品以历史叙事保存成吉思汗家族、部族关系和国家形成过程中的言行与事件，主体属于传世历史原始文献。现代导言说明文本形成、语言特点和传本关系，但不把原始文献改造成现代研究专著。读者可以连续阅读原文叙事及其译文，现代说明用于帮助理解历史语境。全书核心仍是传世文献本身，叙事人物、历史事件和言语记录均来自原作，导言不取代这些原始内容。篇章中的世系、誓言、征战经过和人物对话继续按传世文本次序呈现，译注只解释语词、异读与文化背景，不另造一套现代分析叙事。",
      "译注说明\n本译注本依据蒙古文原文逐段翻译，对人名、地名、制度词汇和古代习语作注，并逐项说明不同转写和译法的选择。译者保留原文篇章次序和叙事结构，遇有异文时注明版本依据，不凭现代观点改写历史内容。译注本附必要的词汇索引、版本说明和翻译原则，使原始文献能够以现代整理形式阅读。本译注本的译者角色和版本身份均由题名页与译注说明直接证明。各段译文与原文对应排列，校记注明采用的文本和异读，便于读者核对翻译与版本依据。",
    ],
    expectedTitle: "蒙古秘史",
    expectedClass: "primary_source_modern_edition",
  },
  {
    id: "insufficient-unknown",
    pages: ["题名：河套资料\n编印单位：资料室\n内部印行"],
    expectedTitle: "河套资料",
    expectedClass: "unknown",
  },
];

function inspectionFor(pages: string[]): PdfTextInspection {
  return {
    pageCount: pages.length,
    pageIndices: pages.map((_, index) => index + 1),
    pages: pages.map((text, index) => ({
      pageIndex: index + 1,
      text,
      evidenceOrigin: "native_text" as const,
      ocrEngine: null,
      ocrConfidence: null,
    })),
    embeddedMetadata: {},
    complete: true,
    hasUsableTextLayer: true,
  };
}

function boundedDiagnostic(error: unknown): string {
  if (error instanceof BibliographicIntelligenceError) return `${error.code}:${error.diagnostic}`;
  if (error instanceof Error) return `${error.name}:${error.message.replace(/[^A-Za-z0-9 ._:[\]-]/gu, "_").slice(0, 160)}`;
  return "unknown_error";
}

const reasoner = new LlamaServerBibliographicReasoner();
const outcomes: Array<Record<string, unknown>> = [];

try {
  for (const item of CASES) {
    const started = process.hrtime.bigint();
    try {
      const result = await deriveIntelligentBibliography(inspectionFor(item.pages), reasoner);
      const durationMilliseconds = Number((process.hrtime.bigint() - started) / 1_000_000n);
      const titleOkay = result.canonical?.canonicalTitle === item.expectedTitle;
      const classOkay = result.canonical?.materialClass === item.expectedClass;
      const classEvidenceOkay = item.expectedClass === "unknown"
        ? result.status !== "auto_apply"
        : result.fields.some((field) => field.fieldName === "materialClass" && field.sourceType === "class_support");
      const fieldEvidenceOkay = result.canonical !== null
        && result.fields.length > 0
        && result.fields.every((field) => /^[a-f0-9]{64}$/u.test(field.evidenceSha256));
      const provenanceOkay = result.provenance.reasoning.family === NUEXTRACT_REASONING_MODEL.family
        && result.provenance.reasoning.name === NUEXTRACT_REASONING_MODEL.name
        && result.provenance.reasoning.revision === NUEXTRACT_REASONING_MODEL.revision
        && result.provenance.reasoning.sha256 === NUEXTRACT_REASONING_MODEL.sha256
        && result.provenance.reasoning.quantization === NUEXTRACT_REASONING_MODEL.quantization;
      const noRawEvidence = !JSON.stringify(result).includes("evidenceText");
      outcomes.push({
        id: item.id,
        passed: titleOkay && classOkay && classEvidenceOkay && fieldEvidenceOkay && provenanceOkay && noRawEvidence,
        status: result.status,
        materialClass: result.canonical?.materialClass ?? null,
        titleOkay,
        classOkay,
        classEvidenceOkay,
        fieldEvidenceOkay,
        provenanceOkay,
        noRawEvidence,
        fieldCount: result.fields.length,
        warningCodes: result.warnings,
        durationMilliseconds,
      });
    } catch (error: unknown) {
      outcomes.push({
        id: item.id,
        passed: false,
        status: "error",
        diagnostic: boundedDiagnostic(error),
        durationMilliseconds: Number((process.hrtime.bigint() - started) / 1_000_000n),
      });
    }
  }
} finally {
  await reasoner.close();
}

const passed = outcomes.filter((entry) => entry.passed === true).length;
process.stdout.write(`${JSON.stringify({
  status: passed === CASES.length ? "ok" : "failed",
  model: {
    repository: NUEXTRACT_REASONING_MODEL.repository,
    revision: NUEXTRACT_REASONING_MODEL.revision,
    filename: NUEXTRACT_REASONING_MODEL.filename,
    sha256: NUEXTRACT_REASONING_MODEL.sha256,
    quantization: NUEXTRACT_REASONING_MODEL.quantization,
  },
  authorityBoundary: "model output remained non-authoritative until the unchanged trusted validator",
  passed,
  total: CASES.length,
  outcomes,
})}\n`);
if (passed !== CASES.length) process.exitCode = 1;
