import readline from "node:readline";

const engine = "academiccloud-paddleocr-v1/paddleocr-3.7.0/paddle-3.3.1/PP-OCRv6_small_det@106c97591b235f607453300d9fc8c1cad1b25488/PP-OCRv6_small_rec@bd619643acac4b9650c040234da8d944476ee3f1";
process.stdout.write(`${JSON.stringify({ ready: true, engine })}\n`);
const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of lines) {
  const request = JSON.parse(line);
  process.stdout.write(`${JSON.stringify({ id: request.id, status: "recognized", text: "近代中国史研究\n王明 著", confidence: 93 })}\n`);
}
