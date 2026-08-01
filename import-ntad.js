const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { createClient } = require("@supabase/supabase-js");
const railroadNameMap = require("./railroad-name-map");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CSV_PATH = process.argv[2] || path.join(__dirname, "NTAD_Railroad_Grade_Crossings_-3857243316599733467.csv");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.");
  process.exit(1);
}

if (!fs.existsSync(CSV_PATH)) {
  console.error(`CSV not found: ${CSV_PATH}`);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function toNumber(value) {
  if (value === null || value === undefined) return null;
  const n = Number(String(value).trim());
  return Number.isFinite(n) ? n : null;
}

function toText(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

// Tolerant line-by-line CSV splitter — skips strict quote validation so
// malformed rows (e.g. line 5359 of the NTAD file) do not abort the import.
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

async function parseCsv(csvPath) {
  const fileStream = fs.createReadStream(csvPath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let headers = null;
  const rows = [];
  let skipped = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;

    if (!headers) {
      headers = splitCsvLine(line).map((h) => String(h || "").trim());
      continue;
    }

    const values = splitCsvLine(line);
    if (values.length !== headers.length) {
      skipped++;
      continue;
    }

    // Build a record object keyed by column name (same shape as csv-parse columns:true)
    const record = {};
    for (let i = 0; i < headers.length; i++) {
      record[headers[i]] = values[i];
    }
    rows.push(record);
  }

  if (skipped > 0) {
    console.log(`Skipped ${skipped} malformed row(s).`);
  }

  return rows;
}

async function main() {
  const records = await parseCsv(CSV_PATH);

  const importedAt = new Date().toISOString();

  const rows = records
    .map((r) => {
      const railroadAbbreviation = toText(r.RAILROAD);
      return {
        dot_number: toText(r.CROSSING),
        // Abbreviation from NTAD (e.g. "UP", "BNSF", "NS")
        railroad_abreviation: railroadAbbreviation,
        // Full name from lookup map; falls back to abbreviation until manually populated
        railroad: railroadAbbreviation
          ? (railroadNameMap[railroadAbbreviation] || railroadAbbreviation)
          : null,
        subdivision: toText(r.RRSUBDIV),
        road_name: toText(r.STREET),
        city: toText(r.CITYNAME),
        state: toText(r.STATENAME),
        mile_post_num: toNumber(r.MILEPOST),
        type: toText(r.TYPEXING),
        latitude: toNumber(r.LATITUDE),
        longitude: toNumber(r.LONGITUD),
        planned_footage: null,
        track: null,
        fra_exists: true,
        fra_checked_at: importedAt,
      };
    })
    .filter((r) => r.dot_number);

  console.log(`Parsed ${rows.length} rows. Inserting...`);

  const chunkSize = 500;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from("railroads").insert(chunk);

    if (error) {
      console.error(`Insert failed at rows ${i + 1}-${i + chunk.length}:`, error);
      process.exit(1);
    }

    console.log(`Inserted rows ${i + 1}-${i + chunk.length}`);
  }

  console.log("Import complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
