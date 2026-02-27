// Replace these values with your actual Supabase project URL and anon/public key.
// Find them in your Supabase dashboard under Project Settings > API.
const SUPABASE_URL = "YOUR_SUPABASE_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function renderTable(data) {
  const crossingsTableBody = document.getElementById("crossingsTableBody");
  crossingsTableBody.innerHTML = "";

  data.forEach((row) => {
    const tr = document.createElement("tr");

    if (row.asphalted) {
      tr.classList.add("asphalted-row");
    } else if (row.completed) {
      tr.classList.add("completed-row");
    }

    tr.innerHTML = `
      <td class="dot-link">${row.dot_number ?? ""}</td>
      <td>${row.milepost ?? ""}</td>
      <td>${row.crossing_number ?? ""}</td>
      <td>${row.track_type ?? ""}</td>
      <td>${row.crossing_type ?? ""}</td>
      <td>${row.completed ? "Yes" : "No"}</td>
      <td>${row.asphalted ? "Yes" : "No"}</td>
      <td>${row.planned_footage ?? ""}</td>
      <td>${row.street_name ?? ""}</td>
      <td>${row.completed_by ?? ""}</td>
      <td>${row.date_completed ?? ""}</td>
      <td>${row.helped ? "Yes" : "No"}</td>
    `;

    crossingsTableBody.appendChild(tr);
  });
}

async function loadCrossings() {
  const crossingsTableBody = document.getElementById("crossingsTableBody");
  const subdivisionSelect = document.getElementById("subdivisionSelect");

  crossingsTableBody.innerHTML = "";
  subdivisionSelect.innerHTML = '<option value="all">All Subdivisions</option>';

  // Load subdivisions
  const { data: projects, error: projError } = await supabaseClient
    .from("projects")
    .select("*");

  if (projError) {
    console.error("Error loading projects:", projError);
    return;
  }

  // Populate dropdown
  projects.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.project_id;
    opt.textContent = p.subdivision;
    subdivisionSelect.appendChild(opt);
  });

  // Load ALL crossings from ALL partitions
  let allCrossings = [];

  for (const p of projects) {
    const tableName = "Crossings_p_" + p.subdivision;
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

document.addEventListener("DOMContentLoaded", loadCrossings);
