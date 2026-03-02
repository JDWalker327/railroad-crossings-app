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
const subdivisionSearch = document.getElementById("subdivisionSearch");
const stateFilter = document.getElementById("stateFilter");
const milepostFilter = document.getElementById("milepostFilter");
const lookupResults = document.getElementById("lookupResults");

const crossingsTableBody = document.getElementById("crossingsTableBody");

// ---------------------------------------------------------
// 3. State
// ---------------------------------------------------------
let projectsCache = [];
let allProjectCrossingsCache = [];

let selectedLookup = null; // { state, subdivision_key, display_label, crossing_count }
let lookupCrossingsCache = [];

// ---------------------------------------------------------
// 4. Projects Mode (existing logic, kept)
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

  // Load ALL crossings from ALL partitions
  // NOTE: this can be slow long term, but we’ll leave it for now.
  let allCrossings = [];

  for (const p of projectsCache) {
    const tableName = "Crossings_p_" + p.subdivision;
    const { data: rows, error: crossErr } = await supabaseClient
      .from(tableName)
      .select("*");

    if (!crossErr && rows) {
      allCrossings = allCrossings.concat(rows);
    } else if (crossErr) {
      console.warn("Error loading", tableName, crossErr.message);
    }
  }

  allProjectCrossingsCache = allCrossings;
  renderTable(allProjectCrossingsCache);

  subdivisionSelect.onchange = () => {
    const selected = subdivisionSelect.value;

    if (selected === "all") {
      renderTable(allProjectCrossingsCache);
      return;
    }

    const filtered = allProjectCrossingsCache.filter(
      (row) => String(row.project_id) === String(selected)
    );

    renderTable(filtered);
  };
}

// ---------------------------------------------------------
// 5. Lookup Mode
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
  const st = (stateFilter.value || "").trim().toUpperCase();

  lookupResults.innerHTML = "";

  if (q.length < 2) return;

  const { data, error } = await supabaseClient.rpc("search_up_subdivision_directory", {
    q,
    st: st.length ? st : null,
    lim: 20,
  });

  if (error) {
    lookupResults.innerHTML = `<div style="color:crimson;">${error.message}</div>`;
    return;
  }

  const rows = data || [];
  if (!rows.length) {
    lookupResults.innerHTML = `<div style="opacity:0.7;">No matches</div>`;
    return;
  }

  // Render clickable results
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
      await loadLookupCrossings();
    };

    container.appendChild(btn);
  });

  lookupResults.appendChild(container);
}

async function loadLookupCrossings() {
  if (!selectedLookup) return;

  const { data, error } = await supabaseClient.rpc("get_up_crossings_for_subdivision", {
    st: selectedLookup.state,
    sub_key: selectedLookup.subdivision_key,
  });

  if (error) {
    console.error(error);
    lookupResults.innerHTML = `<div style="color:crimson;">${error.message}</div>`;
    return;
  }

  lookupCrossingsCache = data || [];
  applyLookupMilepostFilterAndRender();
}

function applyLookupMilepostFilterAndRender() {
  const mp = (milepostFilter.value || "").trim();

  if (!mp) {
    renderTable(lookupCrossingsCache);
    return;
  }

  // simple contains filter; we can upgrade to numeric/range later
  const filtered = lookupCrossingsCache.filter((r) =>
    String(r.mile_post || "").includes(mp)
  );

  renderTable(filtered);
}

// Wire up lookup search inputs
function setupLookupHandlers() {
  subdivisionSearch.oninput = () => {
    clearTimeout(lookupSearchTimer);
    lookupSearchTimer = setTimeout(searchLookupSubdivisions, 250);
  };

  stateFilter.oninput = () => {
    clearTimeout(lookupSearchTimer);
    lookupSearchTimer = setTimeout(searchLookupSubdivisions, 250);
  };

  milepostFilter.oninput = () => {
    applyLookupMilepostFilterAndRender();
  };
}

// ---------------------------------------------------------
// 6. Render Table
// ---------------------------------------------------------
function renderTable(rows) {
  crossingsTableBody.innerHTML = "";

  rows.forEach((row) => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${row.dot_number || row.crossing_id || ""}</td>
      <td>${row.milepost || row.mile_post || ""}</td>
      <td>${row.crossing_number || ""}</td>
      <td>${row.track_type || ""}</td>
      <td>${row.crossing_type || ""}</td>
      <td>${row.completed ? "Yes" : "No"}</td>
      <td>${row.asphalted ? "Yes" : "No"}</td>
      <td>${row.planned_footage || ""}</td>
      <td>${row.street_name || row.road_name || ""}</td>
      <td>${row.completed_by || ""}</td>
      <td>${row.date_completed || ""}</td>
      <td>${row.helped || ""}</td>
    `;

    crossingsTableBody.appendChild(tr);
  });
}

// ---------------------------------------------------------
// 7. Init / Mode switching
// ---------------------------------------------------------
async function init() {
  setupLookupHandlers();

  modeSelect.onchange = async () => {
    const mode = modeSelect.value;

    if (mode === "projects") {
      lookupControls.style.display = "none";
      projectsControls.style.display = "flex";
      clearLookupUI();
      await loadProjectsMode();
    } else {
      projectsControls.style.display = "none";
      lookupControls.style.display = "flex";
      // do not auto-load crossings; user searches
      crossingsTableBody.innerHTML = "";
    }
  };

  // default mode
  await loadProjectsMode();
}

init();
