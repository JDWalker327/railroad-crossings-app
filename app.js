// -----------------------------------------------------
// Initialize Supabase
// -----------------------------------------------------
const supabaseClient = supabase.createClient(
  "https://hbesqtcjkcjmzowhgowe.supabase.co",
  "sb_publishable_Q0n-culzSKm8afh8tArpXw_WwQZIY0Y"
);

// -----------------------------------------------------
// DOM ELEMENTS
// -----------------------------------------------------
const loginContainer = document.getElementById("login-container");
const dashboard = document.getElementById("dashboard");
const loginBtn = document.getElementById("login-btn");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const projectSelector = document.getElementById("project-selector");
const dataSection = document.getElementById("data-section");

// -----------------------------------------------------
// LOGIN HANDLER
// -----------------------------------------------------
loginBtn.addEventListener("click", async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    alert("Login failed: " + error.message);
    return;
  }

  loginContainer.style.display = "none";
  dashboard.style.display = "block";

  loadSubdivisions();
  loadData();
});

// -----------------------------------------------------
// LOAD SUBDIVISIONS
// -----------------------------------------------------
async function loadSubdivisions() {
  const { data, error } = await supabaseClient
    .from("projects")
    .select("project_id, subdivision")
    .order("subdivision", { ascending: true });

  if (error) {
    console.error("Subdivision load error:", error);
    return;
  }

  projectSelector.innerHTML = `<option value="all">All Subdivisions</option>`;

  data.forEach(row => {
    const opt = document.createElement("option");
    opt.value = row.project_id;
    opt.textContent = row.subdivision;
    projectSelector.appendChild(opt);
  });
}

// -----------------------------------------------------
// LOAD DATA FROM PARENT TABLE "Crossings"
// -----------------------------------------------------
async function loadData() {
  let query = supabaseClient.from("Crossings").select("*");

  if (projectSelector.value !== "all") {
    query = query.eq("project_id", projectSelector.value);
  }

  const { data, error } = await query.order("mile-post", { ascending: true });

  if (error) {
    console.error("Data load error:", error);
    return;
  }

  renderTable(data);
}
function renderTable(rows) {
  if (!rows || rows.length === 0) {
    dataSection.innerHTML = "<p>No data found.</p>";
    return;
  }

  let html = `
    <table class="crossings-table">
      <thead>
        <tr>
          <th>Project ID</th>
          <th>DOT #</th>
          <th>Mile Post</th>
          <th>Crossing #</th>
          <th>Track</th>
          <th>Type</th>
          <th>Completed</th>
          <th>Asphalted</th>
          <th>Planned Footage</th>
          <th>Actual Footage</th>
          <th>Completed By</th>
          <th>Date Completed</th>
          <th>Helped</th>
        </tr>
      </thead>
      <tbody>
  `;

  rows.forEach(row => {
    // Determine row color
    let rowClass = "";
    if (row.asphalted === true) rowClass = "asphalted-row";
    else if (row.completed === true) rowClass = "completed-row";

    html += `
      <tr class="${rowClass}">
        <td>${row.project_id}</td>
        <td>
  <td>
  <a 
    href="https://www.fra.dot.gov/railcrossinglocator?search=${row['dot-number']}" 
    target="_blank"
  >
    ${row["dot-number"]}
  </a>
</td>


        <td>${row["mile-post"]}</td>
        <td>${row.crossing_number}</td>
        <td>${row.track}</td>
        <td>${row.type}</td>
        <td>${row.completed}</td>
        <td>${row.asphalted}</td>
        <td>${row.planned_footage}</td>
        <td>${row.actual_footage}</td>
        <td>${row.completed_by}</td>
        <td>${row.date_completed}</td>
        <td>${row.helped}</td>
      </tr>
    `;
  });

  html += "</tbody></table>";
  dataSection.innerHTML = html;
}

// -----------------------------------------------------
// RENDER TABLE — MATCHES YOUR REAL COLUMN NAMES
// -----------------------------------------------------


// -----------------------------------------------------
// DROPDOWN CHANGE HANDLER
// -----------------------------------------------------
projectSelector.addEventListener("change", loadData);



