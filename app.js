// ---- Supabase client (v1 global) ----
const SUPABASE_URL = "https://hbesqtcjkcjmzowhgowe.supabase.co";
const SUPABASE_KEY = "sb_publishable_Q0n-culzSKm8afh8tArpXw_WwQZIY0Y";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

// ---- DOM elements ----
const dashboardContainer = document.getElementById("dashboardContainer");
const subdivisionSelect = document.getElementById("subdivisionSelect");
const crossingsTableBody = document.getElementById("crossingsTableBody");

// ---- Load crossings + subdivisions ----
async function loadCrossings() {
  crossingsTableBody.innerHTML = "";
  subdivisionSelect.innerHTML = '<option value="all">All Subdivisions</option>';

  // Load subdivisions from "projects" table
  const { data: projects, error: projError } = await supabaseClient
    .from("projects")
    .select("*");

  if (projError) {
    console.error("Error loading projects:", projError);
    return;
  }

  projects.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.project_id;
    opt.textContent = p.subdivision;
    subdivisionSelect.appendChild(opt);
  });

  // Default: load ALL crossings from ALL partitions
  let allCrossings = [];

  for (const p of projects) {
    const tableName = "Crossings_p_" + p.subdivision.toLowerCase().replace(/ /g, "_");

    const { data: rows, error: crossErr } = await supabaseClient
      .from(tableName)
      .select("*");

    if (!crossErr && rows) {
      allCrossings = allCrossings.concat(rows);
    }
  }

  renderTable(allCrossings);

  subdivisionSelect.onchange = () => {
    const selected = subdivisionSelect.value;

    if (selected === "all") {
      renderTable(allCrossings);
      return;
    }

    const filtered = allCrossings.filter(
      (row) => String(row.project_id) === String(selected)
    );

    renderTable(filtered);
  };
}

// ---- Render table rows ----
function renderTable(rows) {
  crossingsTableBody.innerHTML = "";

  // Sort by milepost ascending
  rows.sort((a, b) => {
    const m1 = parseFloat(a["mile-post"]) || 0;
    const m2 = parseFloat(b["mile-post"]) || 0;
    return m1 - m2;
  });

  rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.dataset.lat = row.latitude;
    tr.dataset.lon = row.longitude;

    if (row.completed === true) tr.classList.add("completed-row");
    if (row.asphalted === true) tr.classList.add("asphalted-row");

    tr.innerHTML = `
      <td>
        <a href="#" class="dot-link" data-lat="${row.latitude}" data-lon="${row.longitude}">
          ${row["dot-number"] || ""}
        </a>
      </td>
      <td>${row["mile-post"] || ""}</td>
      <td>${row.crossing_number || ""}</td>
      <td>${row.track || ""}</td>
      <td>${row.type || ""}</td>
      <td>${row.completed ? "Yes" : "No"}</td>
      <td>${row.asphalted ? "Yes" : "No"}</td>
      <td>${row.planned_footage || ""}</td>
      <td>${row.road_name || ""}</td>
      <td>${row.completed_by || ""}</td>
      <td>${row.date_completed || ""}</td>
      <td>${row.helped || ""}</td>
    `;

    crossingsTableBody.appendChild(tr);
  });

  // DOT → Google Maps
  document.querySelectorAll(".dot-link").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const lat = link.dataset.lat;
      const lon = link.dataset.lon;
      if (lat && lon) {
        window.open(`https://www.google.com/maps?q=${lat},${lon}`, "_blank");
      }
    });
  });
}

// ---- Auto-load dashboard on page open ----
document.addEventListener("DOMContentLoaded", () => {
  dashboardContainer.style.display = "block";
  loadCrossings();
});
