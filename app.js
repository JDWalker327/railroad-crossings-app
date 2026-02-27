console.log("force redeploy 4");

// ---------------------------------------------------------
// 1. Initialize Supabase Client
// ---------------------------------------------------------
const supabaseClient = supabase.createClient(
  "https://hbesqtcjkcjmzowhgowe.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." // your anon key
);

// ---------------------------------------------------------
// 2. DOM Elements
// ---------------------------------------------------------
const subdivisionSelect = document.getElementById("subdivisionSelect");
const crossingsTableBody = document.getElementById("crossingsTableBody");

// ---------------------------------------------------------
// 3. Load All Crossings + Subdivisions
// ---------------------------------------------------------
async function loadCrossings() {
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

// ---------------------------------------------------------
// 4. Render Table
// ---------------------------------------------------------
function renderTable(rows) {
  crossingsTableBody.innerHTML = "";

  rows.forEach((row) => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${row.dot_number || ""}</td>
      <td>${row.milepost || ""}</td>
      <td>${row.crossing_number || ""}</td>
      <td>${row.track_type || ""}</td>
      <td>${row.crossing_type || ""}</td>
      <td>${row.completed ? "Yes" : "No"}</td>
      <td>${row.asphalted ? "Yes" : "No"}</td>
      <td>${row.planned_footage || ""}</td>
      <td>${row.street_name || ""}</td>
      <td>${row.completed_by || ""}</td>
      <td>${row.date_completed || ""}</td>
      <td>${row.helped || ""}</td>
    `;

    crossingsTableBody.appendChild(tr);
  });
}

// ---------------------------------------------------------
// 5. Start App
// ---------------------------------------------------------
loadCrossings();
