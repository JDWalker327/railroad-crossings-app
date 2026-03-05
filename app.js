console.log("app start");

// ---------------------------------------------------------
// 0. HTML-escaping helper (prevents XSS via innerHTML)
// ---------------------------------------------------------
function escHtml(val) {
  if (val == null) return "";
  return String(val)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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
    lookupResults.innerHTML = `<div style="color:crimson;">${escHtml(error.message)}</div>`;
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

    btn.innerHTML = `<strong>${escHtml(r.display_label)}</strong> — ${escHtml(r.state)}<div style="opacity:0.7;font-size:12px;">${escHtml(r.crossing_count)} crossings</div>`;

    btn.onclick = async () => {
      selectedLookup = r;
      lookupResults.innerHTML = `<div style="opacity:0.8;">Loading crossings for <strong>${escHtml(r.display_label)}</strong>…</div>`;
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
      subdivision: selectedLookup.display_label,
    }
  );

  if (error) {
    console.error(error);
    lookupResults.innerHTML = `<div style="color:crimson;">${escHtml(error.message)}</div>`;
    return;
  }

  lookupCrossingsCache = data || [];
  lookupResults.innerHTML = `<div style="opacity:0.8;"><strong>${escHtml(selectedLookup.display_label)}</strong> — ${lookupCrossingsCache.length} crossing(s) found</div>`;
  renderLookupTable(lookupCrossingsCache);
}

async function lookupByDot() {
  const dot = (dotSearch.value || "").trim().toUpperCase();

  lookupResults.innerHTML = "";
  crossingsTableBody.innerHTML = "";
  selectedLookup = null;
  lookupCrossingsCache = [];

  if (!dot) return;

  lookupResults.innerHTML = `<div style="opacity:0.8;">Searching DOT <strong>${escHtml(dot)}</strong>…</div>`;

  // Pull fields matching stg_form71_up column list
  const { data, error } = await supabaseClient
    .from("form71_up_dedup")
    .select(
      "crossing_id,state,city,road_name,railroad_subdivision,mile_post,crossing_surface_length_ft,latitude,longitude"
    )
    .eq("crossing_id", dot)
    .limit(10);

  if (error) {
    lookupResults.innerHTML = `<div style="color:crimson;">${escHtml(error.message)}</div>`;
    renderLookupTable([]);
    return;
  }

  const rows = data || [];
  if (!rows.length) {
    lookupResults.innerHTML = `<div style="opacity:0.7;">No match for DOT <strong>${escHtml(dot)}</strong></div>`;
    renderLookupTable([]);
    return;
  }

  lookupResults.innerHTML = `<div style="opacity:0.8;">Found ${rows.length} result(s) for DOT <strong>${escHtml(dot)}</strong></div>`;
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

    // DOT links to Google Maps only when lat/lon exist
    const lat = row.latitude;
    const lon = row.longitude;
    const dotHtml =
      lat != null && lon != null && String(lat).length && String(lon).length
        ? `<a href="https://www.google.com/maps?q=${encodeURIComponent(lat)},${encodeURIComponent(lon)}" target="_blank" rel="noopener noreferrer">${escHtml(dot)}</a>`
        : escHtml(dot);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${dotHtml}</td>
      <td>${escHtml(milepost)}</td>
      <td>${escHtml(row.crossing_number)}</td>
      <td>${escHtml(trackType)}</td>
      <td>${escHtml(crossingType)}</td>
      <td>${row.completed ? "Yes" : "No"}</td>
      <td>${row.asphalted ? "Yes" : "No"}</td>
      <td>${escHtml(row.planned_footage)}</td>
      <td>${escHtml(streetName)}</td>
      <td>${escHtml(row.completed_by)}</td>
      <td>${escHtml(row.date_completed)}</td>
      <td>${escHtml(row.helped)}</td>
    `;

    // Apply highlight classes defined in style.css
    if (row.asphalted) tr.classList.add("asphalted-row");
    if (row.completed) tr.classList.add("completed-row");

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

    // crossing_id links to Google Maps only when lat/lon exist
    const crossingIdHtml =
      row.latitude != null &&
      row.longitude != null &&
      String(row.latitude).length &&
      String(row.longitude).length
        ? `<a href="https://www.google.com/maps?q=${encodeURIComponent(row.latitude)},${encodeURIComponent(row.longitude)}" target="_blank" rel="noopener noreferrer">${escHtml(crossingId)}</a>`
        : escHtml(crossingId);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${crossingIdHtml}</td>
      <td>${escHtml(st)}</td>
      <td>${escHtml(city)}</td>
      <td>${escHtml(roadName)}</td>
      <td>${escHtml(sub)}</td>
      <td>${escHtml(mp)}</td>
      <td>${escHtml(len)}</td>
      <td>${escHtml(lat)}</td>
      <td>${escHtml(lon)}</td>
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
