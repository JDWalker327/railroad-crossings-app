const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");

const CSV_PATH = process.argv[2] || path.join(__dirname, "NTAD_Railroad_Grade_Crossings_-3857243316599733467.csv");
const OUT_PATH = process.argv[3] || path.join(__dirname, "railroad_abbreviations.txt");

if (!fs.existsSync(CSV_PATH)) {
  console.error(`CSV not found: ${CSV_PATH}`);
  process.exit(1);
}

function toText(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

function main() {
  const csvRaw = fs.readFileSync(CSV_PATH, "utf8");
  const records = parse(csvRaw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
    relax_column_count: true,
    relax_column_count_more: true,
    relax_column_count_less: true,
    bom: true,
  });

  const map = new Map();

  for (const r of records) {
    const abbr = toText(r.RAILROAD);
    if (!abbr) continue;

    const count = map.get(abbr) || 0;
    map.set(abbr, count + 1);
  }

  const lines = [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([abbr, count]) => `${abbr}\t${count}`);

  fs.writeFileSync(OUT_PATH, lines.join("\n") + "\n", "utf8");

  console.log(`Wrote ${lines.length} unique railroad abbreviations to ${OUT_PATH}`);
}

main();
