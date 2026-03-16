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
// 0b. Map helpers
// ---------------------------------------------------------
function hasLatLon(lat, lon) {
  return (
    lat != null &&
    lon != null &&
    String(lat).trim().length > 0 &&
    String(lon).trim().length > 0
  );
}

function googleMapsUrl(lat, lon) {
  return `https://www.google.com/maps?q=${encodeURIComponent(lat)},${encodeURIComponent(lon)}`;
}

function mapIconSvg() {
  return `
    <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" focusable="false">
      <path fill="currentColor" d="M12 2c-3.86 0-7 3.14-7 7 0 5.25 7 13 7 13s7-7.75 7-13c0-3.86-3.14-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z"/>
    </svg>
  `;
}

function mapLinkHtml(lat, lon) {
  if (!hasLatLon(lat, lon)) return "";
  const url = googleMapsUrl(lat, lon);
  return `
    <a class="map-icon-link" href="${url}" target="_blank" rel="noopener noreferrer"
       title="Open in Google Maps" aria-label="Open in Google Maps">
      ${mapIconSvg()}
    </a>
  `;
}

// ---------------------------------------------------------
// 1. Initialize Supabase Client
// ---------------------------------------------------------
const supabaseClient = supabase.createClient(
  "https://hbesqtcjkcjmzowhgowe.supabase.co",
  "sb_publishable_Q0n-culzSKm8afh8tArpXw_WwQZIY0Y"
);

async function incrementVisitCount() {
  console.log("Calling increment_visits...");
  const { data, error } = await supabaseClient.rpc('increment_visits');
  console.log("RPC result:", data, error);
}
incrementVisitCount();

// ---------------------------------------------------------
// 2. DOM Elements (new UI)
// ---------------------------------------------------------
const subdivisionSelect = document.getElementById("subdivisionSelect");

const dotSearch = document.getElementById("dotSearch");
const dotSearchBtn = document.getElementById("dotSearchBtn");
const subdivisionSearch = document.getElementById("subdivisionSearch");
const lookupResults = document.getElementById("lookupResults");

const crossingsTableHead = document.getElementById("crossingsTableHead");
const crossingsTableBody = document.getElementById("crossingsTableBody");

// ---------------------------------------------------------
// 3. MODE SWITCHING (Tabs)
// ---------------------------------------------------------
const tabs = document.querySelectorAll(".tab");
const header = document.getElementById("modeHeader");
const desc = document.getElementById("modeDescription");

const projectsPanel = document.getElementById("projectsPanel");
const lookupPanel = document.getElementById("lookupPanel");

function setMode(mode) {
  tabs.forEach(t => t.classList.remove("active"));
  document.querySelector(`[data-mode="${mode}"]`).classList.add("active");

  if (mode === "projects") {
    header.textContent = "Projects Mode";
    desc.textContent = "View and manage crossings for your active Rail 1 projects.";

    projectsPanel.style.display = "block";
    lookupPanel.style.display = "none";
  } else {
    header.textContent = "Lookup Mode";
    desc.textContent = "Search the full Union Pacific crossing database.";

    projectsPanel.style.display = "none";
    lookupPanel.style.display = "block";
  }
}

tabs.forEach(tab => {
  tab.addEventListener("click", () => {
    setMode(tab.dataset.mode);
  });
});

setMode("projects");

// ---------------------------------------------------------
// 4. PROJECTS MODE (clean + modern)
// ---------------------------------------------------------
async function loadProjects() {
  const { data: projects, error } = await supabaseClient
    .from("projects")
    .select("*");

  if (error) {
    console.error("Error loading projects:", error);
    return;
  }

  subdivisionSelect.innerHTML =
    '<option value="" disabled selected>Select subdivision</option>';

  projects.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p.subdivision;
    opt.textContent = p.subdivision;
    subdivisionSelect.appendChild(opt);
  });
}

async function loadProjectCrossings() {
  const subdivision = subdivisionSelect.value;
  if (!subdivision) return;

  const tableName = "crossings_p_" + subdivision;

  const { data, error } = await supabaseClient
    .from(tableName)
    .select("*");

  if (error) {
    console.error("Error loading project crossings:", error);
    return;
  }

  renderProjectsTable(data || []);
}

subdivisionSelect.addEventListener("change", loadProjectCrossings);

// ---------------------------------------------------------
// 5. LOOKUP MODE (DOT or Subdivision search)
// ---------------------------------------------------------
let selectedLookup = null;
let lookupCrossingsCache = [];
let lookupSearchTimer = null;

subdivisionSearch.addEventListener("input", () => {
  clearTimeout(lookupSearchTimer);
  lookupSearchTimer = setTimeout(() => {
    searchLookupSubdivisions();
  }, 300);
});

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
    "search_crossings_stage_subdivisions",
    { q, lim: 20 }
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

    btn.innerHTML = `<strong>${escHtml(r.subdivision)}</strong> — ${escHtml(r.state)}`;

    btn.onclick = async () => {
      selectedLookup = r;
      lookupResults.innerHTML = `<div style="opacity:0.8;">Loading crossings for <strong>${escHtml(r.subdivision)}</strong>…</div>`;
      await loadLookupCrossingsForSubdivision();
    };

    container.appendChild(btn);
  });

  lookupResults.appendChild(container);
}

async function loadLookupCrossingsForSubdivision() {
  if (!selectedLookup) return;

 const { data, error } = await supabaseClient.rpc(
  "get_crossings_stage_for_subdivision",
  {
    subdivision_input: selectedLookup.subdivision
  }
);





  if (error) {
    console.error(error);
    lookupResults.innerHTML = `<div style="color:crimson;">${escHtml(error.message)}</div>`;
    return;
  }

  lookupCrossingsCache = data || [];
  lookupResults.innerHTML = `<div style="opacity:0.8;"><strong>${escHtml(selectedLookup.subdivision)}</strong> — ${lookupCrossingsCache.length} crossing(s) found</div>`;
  renderLookupTable(lookupCrossingsCache);
}

// ---------------------------------------------------------
// 6. DOT Lookup
// ---------------------------------------------------------
dotSearchBtn.addEventListener("click", async () => {
  const dot = dotSearch.value.trim();
  if (!dot) return;

  const { data, error } = await supabaseClient
    .from("stg_form71_up")
    .select("*")
    .eq("crossing_id", dot);

  if (error) {
    console.error(error);
    return;
  }

  renderLookupTable(data || []);
});

// ---------------------------------------------------------
// 7. TABLE RENDERING
// ---------------------------------------------------------

function renderProjectsTable(rows) {
  crossingsTableHead.innerHTML = `
    <tr>
      <th>Map</th>
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

  crossingsTableBody.innerHTML = "";

  // ⭐ SORT BY MILEPOST ASCENDING
  rows.sort((a, b) => {
    const mpA = parseFloat(a["mile-post"]);
    const mpB = parseFloat(b["mile-post"]);
    return mpA - mpB;
  });

  rows.forEach(row => {
    const tr = document.createElement("tr");

    // ⭐ APPLY COLORING
    if (row.completed === true) tr.classList.add("completed-row");
    if (row.asphalted === true) tr.classList.add("asphalted-row");

    tr.innerHTML = `
      <td>${mapLinkHtml(row.latitude, row.longitude)}</td>
      <td>${escHtml(row["dot-number"])}</td>
      <td>${escHtml(row["mile-post"])}</td>
      <td>${escHtml(row.crossing_number)}</td>
      <td>${escHtml(row.track)}</td>
      <td>${escHtml(row.type)}</td>
      <td>${escHtml(row.completed)}</td>
      <td>${escHtml(row.asphalted)}</td>
      <td>${escHtml(row.planned_footage)}</td>
      <td>${escHtml(row.road_name)}</td>
      <td>${escHtml(row.completed_by)}</td>
      <td>${escHtml(row.date_completed)}</td>
      <td>${escHtml(row.helped)}</td>
    `;

    crossingsTableBody.appendChild(tr);
  });
}

function renderLookupTable(rows) {
  crossingsTableHead.innerHTML = `
    <tr>
      <th>Map</th>
      <th>DOT #</th>
      <th>Milepost</th>
      <th>City</th>
      <th>Road Name</th>
      <th>State</th>
      <th>Subdivision</th>
      <th>Planned Footage</th>
      <th>Latitude</th>
      <th>Longitude</th>
    </tr>
  `;

  crossingsTableBody.innerHTML = "";

  // ⭐ SORT BY MILEPOST ASCENDING
  rows.sort((a, b) => {
    const mpA = parseFloat(a["mile-post"]) || 0;
    const mpB = parseFloat(b["mile-post"]) || 0;
    return mpA - mpB;
  });

  rows.forEach(row => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>
        ${
          row.latitude && row.longitude
            ? `
              <a 
                class="map-icon-link" 
                href="https://www.google.com/maps?q=${row.latitude},${row.longitude}" 
                target="_blank"
              >
                <svg width="20" height="20" viewBox="0 0 24 24">
                  <path d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5c-1.4 0-2.5-1.1-2.5-2.5S10.6 6.5 12 6.5s2.5 1.1 2.5 2.5S13.4 11.5 12 11.5z"/>
                </svg>
              </a>
            `
            : ""
        }
      </td>

      <td>${escHtml(row["dot-number"] || "")}</td>
      <td>${escHtml(row["mile-post"] || "")}</td>
      <td>${escHtml(row.city || "")}</td>
      <td>${escHtml(row.road_name || "")}</td>
      <td>${escHtml(row.state || "")}</td>
      <td>${escHtml(row.subdivision || "")}</td>
      <td>${escHtml(row.planned_footage || "")}</td>
      <td>${escHtml(row.latitude || "")}</td>
      <td>${escHtml(row.longitude || "")}</td>
    `;

    crossingsTableBody.appendChild(tr);
  });
}



// ---------------------------------------------------------
// 8. INITIAL LOAD
// ---------------------------------------------------------
loadProjects();
