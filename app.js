const supabaseClient = supabase.createClient(
  "https://hbesqtcjkcjmzowhgowe.supabase.co",
  "sb_publishable_Q0n-culzSKm8afh8tArpXw_WwQZIY0Y"
);

const crossingsTableBody = document.getElementById("crossingsTableBody");
const subdivisionSelect = document.getElementById("subdivisionSelect");

function renderTable(rows) {
  crossingsTableBody.innerHTML = "";

  rows.forEach((row) => {
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
      <td>${row.helped ?? ""}</td>
    `;

    crossingsTableBody.appendChild(tr);
  });
}

async function loadCrossings() {
  crossingsTableBody.innerHTML = "";
  subdivisionSelect.innerHTML = '<option value="all">All Subdivisions</option>';

  // Load subdivisions
  const { data: projects, error: projError } = await supabaseClient
    .from("projects")
    .select("*");

  if (projError) {
    console.error("Error loading projects:", projError);
  } else {
    // Populate dropdown
    projects.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.project_id;
      opt.textContent = p.subdivision;
      subdivisionSelect.appendChild(opt);
    });
  }

  // Load ALL crossings — try "Crossings" (capital C) first, then lowercase fallback
  let allCrossings = [];
  const { data: crossingsData, error: crossErr } = await supabaseClient
    .from("Crossings")
    .select("*");

  if (!crossErr && crossingsData !== null) {
    allCrossings = crossingsData;
  } else {
    console.error("Error loading Crossings:", crossErr);
    const { data: crossingsLower, error: crossErrLower } = await supabaseClient
      .from("crossings")
      .select("*");
    if (!crossErrLower && crossingsLower !== null) {
      allCrossings = crossingsLower;
    } else {
      console.error("Error loading crossings (lowercase):", crossErrLower);
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

loadCrossings();
