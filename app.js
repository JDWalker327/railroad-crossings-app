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
const loginContainer = document.getElementById("loginContainer");
const dashboardContainer = document.getElementById("dashboardContainer");

const usernameInput = document.getElementById("usernameInput");
const passwordInput = document.getElementById("passwordInput");
const loginButton = document.getElementById("loginButton");
const loginError = document.getElementById("loginError");

const subdivisionSelect = document.getElementById("subdivisionSelect");
const crossingsTableBody = document.getElementById("crossingsTableBody");

document.addEventListener("DOMContentLoaded", async () => {
  const { data: { session } } = await supabaseClient.auth.getSession();

  if (session) {
    // Already logged in
    loginContainer.style.display = "none";
    dashboardContainer.style.display = "block";
    loadCrossings();
  } else {
    // Not logged in
    loginContainer.style.display = "block";
    dashboardContainer.style.display = "none";
  }
});


// ---- Login handler (username → fake email) ----
loginButton.addEventListener("click", async () => {
  loginError.style.display = "none";
  loginError.textContent = "";

  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();

  if (!username || !password) {
    loginError.textContent = "Please enter username and password.";
    loginError.style.display = "block";
    return;
  }

  // Convert username → fake email
  const email = `${username}@rail.local`;

  const { user, error } = await supabaseClient.auth.signIn({
    email,
    password,
  });

  if (error) {
    loginError.textContent = "Invalid username or password.";
    loginError.style.display = "block";
    return;
  }

  loginContainer.style.display = "none";
  dashboardContainer.style.display = "block";

  loadCrossings();
});

// ---- Load crossings + subdivisions ----
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

  projects.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.project_id;
    opt.textContent = p.subdivision;
    subdivisionSelect.appendChild(opt);
  });

  // Load crossings
  const { data: crossings, error: crossError } = await supabaseClient
    .from("Crossings")
    .select("*");

  if (crossError) {
    console.error("Error loading Crossings:", crossError);
    return;
  }

  renderTable(crossings);

  subdivisionSelect.onchange = () => {
    const selected = subdivisionSelect.value;

    if (selected === "all") {
      renderTable(crossings);
      return;
    }

    const filtered = crossings.filter(
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
        <a href="#" class="dot-link"
           data-lat="${row.latitude}"
           data-lon="${row.longitude}">
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

  // Mobile‑safe DOT → Google Maps
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
