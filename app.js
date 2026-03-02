console.log("app start");

// ---------------------------------------------------------
// 1. Initialize Supabase Client
// ---------------------------------------------------------
const supabaseClient = supabase.createClient(
  "https://hbesqtcjkcjmzowhgowe.supabase.co",
  "sb_publishable_Q0n-culzSKm8afh8tArpXw_WwQZIY0Y"
);

// ---------------------------------------------------------
// 2. DOM Elements
// ---------------------------------------------------------
const modeSelect = document.getElementById("modeSelect");

const projectsControls = document.getElementById("projectsControls");
const subdivisionSelect = document.getElementById("subdivisionSelect");

const lookupControls = document.getElementById("lookupControls");
const dotSearch = document.getElementById("dotSearch");
const dotSearchBtn = document.getElementById("dotSearchBtn");
const subdivisionSearch = document.getElementById("subdivisionSearch");
const lookupResults = document.getElementById("lookupResults");

const crossingsTableHead = document.getElementById("crossingsTableHead");
const crossingsTableBody = document.getElementById("crossingsTableBody");

// ---------------------------------------------------------
// 3. State
// ---------------------------------------------------------
let currentMode = "projects";

let projectsCache = [];
let allProjectCrossingsCache = [];

let selectedLookup = null; // { state, subdivision_key, display_label, crossing_count }
let lookupCrossingsCache = [];

// ---------------------------------------------------------
// 4. Headers (Projects vs Lookup)
// ---------------------------------------------------------
function renderProjectsHeader() {
  crossingsTableHead.innerHTML = `
    <tr>
      <th>DOT #</th>
      <th>Milepost</th>
      <th>Crossing #</th>
      <th>Track Type</th>
      <th>Crossing Type</th>
      <th>Completed</th>
      <th>Asphalted</th>
      <th>Planned Footage</th>
      <th>Street Name</th>
      <th>Completed By</th>
      <th>Date Completed</th>
      <th>Helped</th>
    </tr>
  `;
}

function renderLookupHeader() {
  // Matches stg_form71_up column list
  crossingsTableHead.innerHTML = `
    <tr>
      <th>crossing_id</th>
      <th>state</th>
      <th>city</th>
      <th>road_name</th>
      <th>railroad_subdivision</th>
      <th>mile_post</th>
      <th>crossing_surface_length_ft</th>
      <th>latitude</th>
      <th>longitude</th>
    </tr>
  `;
}

// ---------------------------------------------------------
// 5. Projects Mode
// ---------------------------------------------------------
async function loadProjectsMode() {
  crossingsTableBody.innerHTML = "";
  subdivisionSelect.innerHTML = '<option value="all">All Subdivisions</option>';

  const { data: projects, error: projError } = await supabaseClient
    .from("projects")
    .select("*");

  if (projError) {
    console.error("Error loading projects:", projError);
    return;
  }

  projectsCache = projects || [];

  // Populate dropdown
  projectsCache.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.project_id;
    opt.textContent = p.subdivision;
    subdivisionSelect.appendChild(opt);
  });

  // Load ALL crossings from ALL partitions (can be slow)
  let allCrossings = [];

  for (const p of projectsCache) {
    const tableName = "crossings_p_" + p.subdivision;

    const { data: rows, error: crossErr } = await supabaseClient
      .from(tableName)
      .select("*");

    if (crossErr) {
      console.warn("Error loading", tableName, crossErr.message);
      continue;
    }

    if (rows && rows.length) {
      allCrossings = allCrossings.concat(rows);
    }
  }

  allProjectCrossingsCache = allCrossings;
  renderProjectsTable(allProjectCrossingsCache);

  subdivisionSelect.onchange = () => {
    const selected = subdivisionSelect.value;

    if (selected === "all") {
      renderProjectsTable(allProjectCrossingsCache);
      return;
    }

    const filtered = allProjectCrossingsCache.filter(
      (row) => String(row.project_id) === String(selected)
    );

    renderProjectsTable(filtered);
  };
}

// ---------------------------------------------------------
// 6. Lookup Mode (Subdivision OR DOT search)
// ---------------------------------------------------------
let lookupSearchTimer = null;

function clearLookupUI() {
  selectedLookup = null;
  lookupCrossingsCache = [];
  lookupResults.innerHTML = "";
  crossingsTableBody.innerHTML = "";
}

async function searchLookupSubdivisions() {
  const q = (subdivisionSearch.value || "").trim();

  lookupResults.innerHTML = "";
  selectedLookup = null;

  if (q.length < 2) return;

  const { data, error } = await supabaseClient.rpc(
    "search_up_subdivision_directory",
    {
      q,
      st: null, // removed state filter: useless without subdivision
      lim: 20,
    }
  );

  if (error) {
    lookupResults.innerHTML = `<div style="color:crimson;">${error.message}</div>`;
    return;
  }

  const rows = data || [];
  if (!rows.length) {
    lookupResults.innerHTML = `<div style="opacity:0.7;">No matches</div>`;
    return;
  }

  const container = document.createElement("div");
  rows.forEach((r) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.style.display = "block";
    btn.style.width = "100%";
    btn.style.textAlign = "left";
    btn.style.padding = "6px";
    btn.style.marginBottom = "6px";
    btn.style.cursor = "pointer";

    btn.innerHTML = `<strong>${r.display_label}</strong> — ${r.state}<div style="opacity:0.7;font-size:12px;">${r.crossing_count} crossings</div>`;

    btn.onclick = async () => {
      selectedLookup = r;
      lookupResults.innerHTML = `<div style="opacity:0.8;">Loading crossings for <strong>${r.display_label}</strong>…</div>`;
      await loadLookupCrossingsForSubdivision();
    };

    container.appendChild(btn);
  });

  lookupResults.appendChild(container);
}

async function loadLookupCrossingsForSubdivision() {
  if (!selectedLookup) return;

  const { data, error } = await supabaseClient.rpc(
    "get_up_crossings_for_subdivision",
    {
      st: selectedLookup.state,
      sub_key: selectedLookup.subdivision_key,
    }
  );

  if (error) {
    console.error(error);
    lookupResults.innerHTML = `<div style="color:crimson;">${error.message}</div>`;
    return;
  }

  lookupCrossingsCache = data || [];
  renderLookupTable(lookupCrossingsCache);
}

async function lookupByDot() {
  const dot = (dotSearch.value || "").trim().toUpperCase();

  lookupResults.innerHTML = "";
  crossingsTableBody.innerHTML = "";
  selectedLookup = null;
  lookupCrossingsCache = [];

  if (!dot) return;

  lookupResults.innerHTML = `<div style="opacity:0.8;">Searching DOT <strong>${dot}</strong>…</div>`;

  // Pull fields matching stg_form71_up column list
  const { data, error } = await supabaseClient
    .from("form71_up_dedup")
    .select(
      "crossing_id,state,city,road_name,railroad_subdivision,mile_post,crossing_surface_length_ft,latitude,longitude"
    )
    .eq("crossing_id", dot)
    .limit(10);

  if (error) {
    lookupResults.innerHTML = `<div style="color:crimson;">${error.message}</div>`;
    renderLookupTable([]);
    return;
  }

  const rows = data || [];
  if (!rows.length) {
    lookupResults.innerHTML = `<div style="opacity:0.7;">No match for DOT <strong>${dot}</strong></div>`;
    renderLookupTable([]);
    return;
  }

  lookupResults.innerHTML = `<div style="opacity:0.8;">Found ${rows.length} result(s) for DOT <strong>${dot}</strong></div>`;
  renderLookupTable(rows);
}

function setupLookupHandlers() {
  // DOT search
  dotSearchBtn.onclick = lookupByDot;
  dotSearch.onkeydown = (e) => {
    if (e.key === "Enter") lookupByDot();
  };

  // Subdivision typeahead
  subdivisionSearch.oninput = () => {
    clearTimeout(lookupSearchTimer);
    lookupSearchTimer = setTimeout(searchLookupSubdivisions, 250);
  };
}

// ---------------------------------------------------------
// 7. Sorting helpers
// ---------------------------------------------------------
function getMilepostValue(row) {
  const raw = row.milepost ?? row["mile-post"] ?? row.mile_post ?? "";
  if (raw == null) return null;

  const cleaned = String(raw).trim().replace(/[^\d.-]/g, "");
  if (!cleaned) return null;

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------
// 8. Renderers
// ---------------------------------------------------------
function renderProjectsTable(rows) {
  crossingsTableBody.innerHTML = "";

  const sorted = [...rows].sort((a, b) => {
    const ma = getMilepostValue(a);
    const mb = getMilepostValue(b);

    if (ma == null && mb == null) return 0;
    if (ma == null) return 1;
    if (mb == null) return -1;

    return ma - mb;
  });

  sorted.forEach((row) => {
    const dot = row.dot_number ?? row["dot-number"] ?? row.crossing_id ?? "";
    const milepost = row.milepost ?? row["mile-post"] ?? row.mile_post ?? "";
    const trackType = row.track_type ?? row.track ?? "";
    const crossingType = row.crossing_type ?? row.type ?? "";
    const streetName = row.street_name ?? row.road_name ?? "";

    // Option A: DOT links to Google Maps only when lat/lon exist
    const lat = row.latitude;
    const lon = row.longitude;
    const dotHtml =
      lat != null && lon != null && String(lat).length && String(lon).length
        ? `<a href="https://www.google.com/maps?q=${lat},${lon}" target="_blank" rel="noopener noreferrer">${dot}</a>`
        : `${dot}`;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${dotHtml}</td>
      <td>${milepost}</td>
      <td>${row.crossing_number || ""}</td>
      <td>${trackType}</td>
      <td>${crossingType}</td>
      <td>${row.completed ? "Yes" : "No"}</td>
      <td>${row.asphalted ? "Yes" : "No"}</td>
      <td>${row.planned_footage || ""}</td>
      <td>${streetName}</td>
      <td>${row.completed_by || ""}</td>
      <td>${row.date_completed || ""}</td>
      <td>${row.helped || ""}</td>
    `;
    crossingsTableBody.appendChild(tr);
  });
}

function renderLookupTable(rows) {
  crossingsTableBody.innerHTML = "";

  // Sort by mile_post ascending
  const sorted = [...rows].sort((a, b) => {
    const ma = getMilepostValue(a);
    const mb = getMilepostValue(b);

    if (ma == null && mb == null) return 0;
    if (ma == null) return 1;
    if (mb == null) return -1;

    return ma - mb;
  });

  sorted.forEach((row) => {
    const crossingId = row.crossing_id ?? "";
    const st = row.state ?? "";
    const city = row.city ?? "";
    const roadName = row.road_name ?? "";
    const sub = row.railroad_subdivision ?? "";
    const mp = row.mile_post ?? "";
    const len = row.crossing_surface_length_ft ?? "";
    const lat = row.latitude ?? "";
    const lon = row.longitude ?? "";

    // Option A: crossing_id links to Google Maps only when lat/lon exist
    const crossingIdHtml =
      row.latitude != null &&
      row.longitude != null &&
      String(row.latitude).length &&
      String(row.longitude).length
        ? `<a href="https://www.google.com/maps?q=${row.latitude},${row.longitude}" target="_blank" rel="noopener noreferrer">${crossingId}</a>`
        : `${crossingId}`;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${crossingIdHtml}</td>
      <td>${st}</td>
      <td>${city}</td>
      <td>${roadName}</td>
      <td>${sub}</td>
      <td>${mp}</td>
      <td>${len}</td>
      <td>${lat}</td>
      <td>${lon}</td>
    `;
    crossingsTableBody.appendChild(tr);
  });
}

// ---------------------------------------------------------
// 9. Init / Mode switching
// ---------------------------------------------------------
async function init() {
  setupLookupHandlers();

  renderProjectsHeader();

  modeSelect.onchange = async () => {
    const mode = modeSelect.value;
    currentMode = mode;

    if (mode === "projects") {
      renderProjectsHeader();
      lookupControls.style.display = "none";
      projectsControls.style.display = "flex";
      clearLookupUI();
      await loadProjectsMode();
    } else {
      renderLookupHeader();
      projectsControls.style.display = "none";
      lookupControls.style.display = "flex";
      crossingsTableBody.innerHTML = "";
      lookupResults.innerHTML = "";
    }
  };

  await loadProjectsMode();
}

init();
