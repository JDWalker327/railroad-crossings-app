const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");
const { createClient } = require("@supabase/supabase-js");

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

async function main() {
  const csvRaw = fs.readFileSync(CSV_PATH, "utf8");

  const records = parse(csvRaw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  const rows = records.map((r) => ({
    dot_number: toText(r.CROSSING),
    railroad: toText(r.RAILROAD),
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
    fra_checked_at: new Date().toISOString(),
  })).filter((r) => r.dot_number);

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
