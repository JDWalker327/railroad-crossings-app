const fs = require("fs");
const path = require("path");
const readline = require("readline");

const CSV_PATH = process.argv[2] || path.join(__dirname, "NTAD_Railroad_Grade_Crossings_-3857243316599733467.csv");
const OUT_PATH = process.argv[3] || path.join(__dirname, "railroad_abbreviations.txt");

if (!fs.existsSync(CSV_PATH)) {
  console.error(`CSV not found: ${CSV_PATH}`);
  process.exit(1);
}

function splitCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i++;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

async function main() {
  const fileStream = fs.createReadStream(CSV_PATH);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let headers = null;
  let railroadIdx = -1;
  const counts = new Map();
  let lineNumber = 0;
  let skipped = 0;

  for await (const line of rl) {
    lineNumber++;
    if (!line.trim()) continue;

    if (!headers) {
      headers = splitCsvLine(line).map((h) => String(h || "").trim());
      railroadIdx = headers.indexOf("RAILROAD");
      if (railroadIdx === -1) {
        console.error("Could not find RAILROAD column in CSV header.");
        process.exit(1);
      }
      continue;
    }

    const values = splitCsvLine(line);
    if (values.length !== headers.length) {
      skipped++;
      continue;
    }

    const abbr = String(values[railroadIdx] || "").trim();
    if (!abbr) continue;

    counts.set(abbr, (counts.get(abbr) || 0) + 1);
  }

  const lines = [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([abbr, count]) => `${abbr}\t${count}`);

  fs.writeFileSync(OUT_PATH, lines.join("\n") + (lines.length ? "\n" : ""), "utf8");

  console.log(`Wrote ${lines.length} unique railroad abbreviations to ${OUT_PATH}`);
  console.log(`Skipped ${skipped} malformed row(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
