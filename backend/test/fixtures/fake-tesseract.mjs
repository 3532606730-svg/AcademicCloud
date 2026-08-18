const mode = process.argv[2] ?? "english";
const args = process.argv.slice(3);

if (args.includes("--version")) {
  process.stdout.write(`tesseract ${mode === "wrong-version" ? "5.4.1" : "5.5.3"}\n`);
  process.exit(0);
}

if (args.includes("--list-langs")) {
  process.stdout.write(mode === "missing-language"
    ? "List of available languages in tessdata (2):\nchi_sim\neng\n"
    : "List of available languages in tessdata (3):\nchi_sim\nchi_tra\neng\n");
  process.exit(0);
}

if (mode === "hang") {
  process.stdin.resume();
  setInterval(() => undefined, 1_000);
} else {
  const chunks = [];
  process.stdin.on("data", (chunk) => chunks.push(chunk));
  process.stdin.on("end", () => {
    if (mode === "failure") process.exit(2);
    const input = Buffer.concat(chunks);
    if (input.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") process.exit(3);
    const text = mode === "unsupported"
      ? "བོད་ཡིག"
      : mode === "low-confidence"
        ? "Uncertain title"
        : mode === "oversized-text"
          ? "A".repeat(17_000)
          : "The Mongols and the West";
    const confidence = mode === "low-confidence" ? "22.5" : "88.4";
    process.stdout.write("level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n");
    process.stdout.write(`5\t1\t1\t1\t1\t1\t0\t0\t100\t20\t${confidence}\t${text}\n`);
  });
}
