const supabaseClient = supabase.createClient(
  "https://hbesqtcjkcjmzowhgowe.supabase.co",
  "sb_publishable_Q0n-culzSKm8afh8tArpXw_WwQZIY0Y"
);

const crossingsTableBody = document.getElementById("crossingsTableBody");
const subdivisionSelect = document.getElementById("subdivisionSelect");

function renderTable(rows) {
  crossingsTableBody.innerHTML = "";

  rows.sort((a, b) => {
    const m1 = parseFloat(a["mile-post"]) || 0;
    const m2 = parseFloat(b["mile-post"]) || 0;
    return m1 - m2;
  });

  rows.forEach((row) => {
    const tr = document.createElement("tr");

    if (row.asphalted) {
      tr.classList.add("asphalted-row");
    } else if (row.completed) {
      tr.classList.add("completed-row");
    }

    const lat = row.latitude ?? "";
    const lon = row.longitude ?? "";
    const dotNum = row["dot-number"] ?? "";
    const dotCell = lat && lon
      ? `<a href="https://www.google.com/maps?q=${lat},${lon}" target="_blank" class="dot-link">${dotNum}</a>`
      : dotNum;

    tr.innerHTML = `
      <td>${dotCell}</td>
      <td>${row["mile-post"] ?? ""}</td>
      <td>${row.crossing_number ?? ""}</td>
      <td>${row.track ?? ""}</td>
      <td>${row.type ?? ""}</td>
      <td>${row.completed ? "Yes" : "No"}</td>
      <td>${row.asphalted ? "Yes" : "No"}</td>
      <td>${row.planned_footage ?? ""}</td>
      <td>${row.road_name ?? ""}</td>
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
  let crossingsLoadError = null;

  const { data: crossingsData, error: crossErr } = await supabaseClient
    .from("Crossings")
    .select("*");

  if (!crossErr && crossingsData !== null) {
    allCrossings = crossingsData;
  } else {
    const { data: crossingsLower, error: crossErrLower } = await supabaseClient
      .from("crossings")
      .select("*");

    if (!crossErrLower && crossingsLower !== null) {
      allCrossings = crossingsLower;
    } else {
      crossingsLoadError = crossErr || crossErrLower;
      console.error("Error loading crossings:", crossingsLoadError);
    }
  }

  if (crossingsLoadError) {
    crossingsTableBody.innerHTML = `<tr><td colspan="12" style="color:red;padding:1rem;">
      Failed to load crossings data: ${crossingsLoadError.message || JSON.stringify(crossingsLoadError)}
    </td></tr>`;
    return;
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
