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
  process.stdout.write(`${JSON.stringify({ id: request.id, status: "recognized", text: "近代中国史研究\n王明 著", confidence: 93 })}\n`);
}
