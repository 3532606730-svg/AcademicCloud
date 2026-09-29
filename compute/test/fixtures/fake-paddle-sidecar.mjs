import readline from "node:readline";
import { isAbsolute, basename } from "node:path";

if (!isAbsolute(process.env.PADDLE_PDX_CACHE_HOME ?? "")
  || basename(process.env.PADDLE_PDX_CACHE_HOME) !== "academiccloud-paddlex") {
  process.exit(20);
}

const engine = "academiccloud-paddleocr-v1/3.7.0/3.3.1/det@106c97591b235f607453300d9fc8c1cad1b25488/rec@bd619643acac4b9650c040234da8d944476ee3f1";
process.stdout.write(`${JSON.stringify({ ready: true, engine })}\n`);
const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of lines) {
  const request = JSON.parse(line);
  if (request.pageIndex === 5) {
    process.stdout.write(`${JSON.stringify({ id: request.id, status: "recognized", text: " e\u0301\r\n𠮷 ", confidence: 91,
      ...(request.includeGeometry ? { geometry: { status: "available", imageWidth: 100, imageHeight: 200,
        lineBoxes: [{ start: 1, end: 3, x: 0, y: 0, width: 0.5, height: 0.2 },
          { start: 5, end: 7, x: 0, y: 0.5, width: 0.5, height: 0.2 }] } } : {}) })}\n`);
    continue;
  }
  const result = request.pageIndex === 2
    ? { status: "low_confidence", text: request.readerMode ? "uncertain text" : "", confidence: 30 }
    : request.pageIndex === 3
      ? { status: "recognized", text: "𠮷".repeat(16_384), confidence: 93 }
      : request.pageIndex === 4
        ? { status: "invented_state", text: "invalid", confidence: 93 }
        : { status: "recognized", text: "近代中国史研究\n王明 著", confidence: 93 };
  process.stdout.write(`${JSON.stringify({ id: request.id, ...result, ...(request.readerMode ? { truncated: false } : {}) })}\n`);
}
