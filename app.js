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

  // SUCCESS → show dashboard
  loginContainer.style.display = "none";
  dashboard.style.display = "block";

  // Load dropdown + table
  loadSubdivisions();
  loadData();
});

// -----------------------------------------------------
// LOAD SUBDIVISIONS (from Projects table)
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
    opt.value = row.project_id;        // store project_id
    opt.textContent = row.subdivision; // display subdivision name
    projectSelector.appendChild(opt);
  });
}

// -----------------------------------------------------
// LOAD TABLE DATA (from parent Crossings table)
// -----------------------------------------------------
async function loadData() {
  let query = supabaseClient.from("Crossings").select("*");

  // Filter by project_id if a subdivision is selected
  if (projectSelector.value !== "all") {
    query = query.eq("project_id", projectSelector.value);
  }

  const { data, error } = await query.order("mile_post", { ascending: true });

  if (error) {
    console.error("Data load error:", error);
    return;
  }

  renderTable(data);
}

// -----------------------------------------------------
// RENDER TABLE
// -----------------------------------------------------
function renderTable(rows) {
  if (!rows || rows.length === 0) {
    dataSection.innerHTML = "<p>No data found.</p>";
    return;
  }

  let html = `
    <table>
      <thead>
        <tr>
          <th>Subdivision</th>
          <th>Mile Post</th>
          <th>DOT #</th>
          <th>City</th>
          <th>State</th>
          <th>Surface</th>
          <th>Active</th>
        </tr>
      </thead>
      <tbody>
  `;

  rows.forEach(row => {
    html += `
      <tr>
        <td>${row.subdivision}</td>
        <td>${row.mile_post}</td>
        <td>${row.dot_number}</td>
        <td>${row.city}</td>
        <td>${row.state}</td>
        <td>${row.surface}</td>
        <td>${row.active}</td>
      </tr>
    `;
  });

  html += "</tbody></table>";
  dataSection.innerHTML = html;
}

// -----------------------------------------------------
// DROPDOWN CHANGE HANDLER
// -----------------------------------------------------
projectSelector.addEventListener("change", loadData);



