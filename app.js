const { createClient } = window.supabase;

// Supabase init
const SUPABASE_URL = "https://hbesqtcjkcjmzowhgowe.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhiZXNxdGNqa2NqbXpvd2hnb3dlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwNzkxNDksImV4cCI6MjA4MzY1NTE0OX0.lDMaKPazIegKhUMxszA3ArnypeIDDF4YmxR95SXxrII";

const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Login elements
const loginBtn = document.getElementById("login-btn");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const projectSelector = document.getElementById("project-selector");

// LOGIN HANDLER
loginBtn.addEventListener("click", async () => {
  const email = emailInput.value;
  const password = passwordInput.value;

  const { error } = await supabaseClient.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    alert("Login failed: " + error.message);
    return;
  }

  alert("Login successful!");

  document.getElementById("login-container").style.display = "none";
  document.getElementById("dashboard").style.display = "block";

  await loadSubdivisions();
  loadCrossings();
});

// LOAD SUBDIVISIONS FROM PROJECTS TABLE
async function loadSubdivisions() {
  const { data, error } = await supabaseClient
    .from("projects")   // ← CORRECT TABLE NAME
    .select("project_id, subdivision")
    .order("subdivision", { ascending: true });

  console.log("Projects query:", data, error);

  if (error) {
    console.error("Subdivision load error:", error);
    return;
  }

  if (!data || data.length === 0) {
    console.warn("No subdivisions returned. Check table name + RLS.");
    return;
  }

  data.forEach((row) => {
    const opt = document.createElement("option");
    opt.value = row.project_id;
    opt.textContent = row.subdivision;
    projectSelector.appendChild(opt);
  });

  projectSelector.addEventListener("change", () => {
    loadCrossings(projectSelector.value);
  });
}

// LOAD CROSSINGS WITH FILTERING + SORTING + COLORING
async function loadCrossings(projectId = "all") {
  let query = supabaseClient.from("Crossings").select("*");

  if (projectId !== "all") {
    query = query.eq("project_id", projectId);
  }

  const { data, error } = await query;

  const container = document.getElementById("data-section");
  container.innerHTML = "";

  if (error) {
    console.error(error);
    container.innerHTML = "Error loading data.";
    return;
  }

  if (!data || data.length === 0) {
    container.innerHTML = "No data found.";
    return;
  }

  // SORT BY MILE POST ASCENDING
  data.sort((a, b) => (a.mile_post || 0) - (b.mile_post || 0));

  // BUILD TABLE
  const table = document.createElement("table");
  table.className = "data-table";

  const headerRow = document.createElement("tr");

  Object.keys(data[0]).forEach((key) => {
    if (key === "id") return; // REMOVE ID COLUMN
    const th = document.createElement("th");
    th.textContent = key;
    headerRow.appendChild(th);
  });

  table.appendChild(headerRow);

  data.forEach((row) => {
    const tr = document.createElement("tr");

    // COLOR ROWS
    if (row.completed === true) tr.classList.add("completed-row");
    if (row.asphalted === true) tr.classList.add("asphalted-row");

    Object.entries(row).forEach(([key, value]) => {
      if (key === "id") return; // REMOVE ID COLUMN
      const td = document.createElement("td");
      td.textContent = value === null ? "" : value;
      tr.appendChild(td);
    });

    table.appendChild(tr);
  });

  container.appendChild(table);
}
