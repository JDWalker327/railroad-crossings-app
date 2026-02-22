// ---- Supabase client (v1 global) ----
const SUPABASE_URL = "https://hbesqtcjkcjmzowhgowe.supabase.co";
const SUPABASE_KEY = "sb_publishable_Q0n-culzSKm8afh8tArpXw_WwQZIY0Y";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ---- DOM elements ----
const loginContainer = document.getElementById("loginContainer");
const dashboardContainer = document.getElementById("dashboardContainer");

const emailInput = document.getElementById("emailInput");
const passwordInput = document.getElementById("passwordInput");
const loginButton = document.getElementById("loginButton");
const loginError = document.getElementById("loginError");

const subdivisionSelect = document.getElementById("subdivisionSelect");
const crossingsTableBody = document.getElementById("crossingsTableBody");

// ---- Login handler (Supabase v1 syntax) ----
loginButton.addEventListener("click", async () => {
  loginError.style.display = "none";
  loginError.textContent = "";

  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();

  if (!email || !password) {
    loginError.textContent = "Please enter email and password.";
    loginError.style.display = "block";
    return;
  }

  const { user, error } = await supabaseClient.auth.signIn({
    email,
    password,
  });

  if (error) {
    loginError.textContent = error.message || "Login failed.";
    loginError.style.display = "block";
    return;
  }

  // Login success
  loginContainer.style.display = "none";
  dashboardContainer.style.display = "block";

  loadCrossings();
});

// ---- Load crossings from Supabase ----
async function loadCrossings() {
  crossingsTableBody.innerHTML = "";
  subdivisionSelect.innerHTML = '<option value="all">All Subdivisions</option>';

  const { data, error } = await supabaseClient
    .from("Crossings")
    .select("*");

  if (error) {
    console.error("Error loading Crossings:", error);
    return;
  }

  if (!data || data.length === 0) {
    crossingsTableBody.innerHTML =
      "<tr><td colspan='12'>No crossings found.</td></tr>";
    return;
  }

  // Build subdivision list (road_name is your closest grouping field)
  const subdivisions = new Set();
  data.forEach((row) => {
    if (row.road_name) subdivisions.add(row.road_name);
  });

  subdivisions.forEach((sub) => {
    const opt = document.createElement("option");
    opt.value = sub;
    opt.textContent = sub;
    subdivisionSelect.appendChild(opt);
  });

  // Render table
  renderTable(data);

  subdivisionSelect.onchange = () => {
    const selected = subdivisionSelect.value;
    const filtered =
      selected === "all"
        ? data
        : data.filter((row) => row.road_name === selected);
    renderTable(filtered);
  };
}

// ---- Render table rows ----
function renderTable(rows) {
  crossingsTableBody.innerHTML = "";

  rows.forEach((row) => {
    const tr = document.createElement("tr");

    // Apply row colors
    if (row.completed === true) tr.classList.add("completed-row");
    if (row.asphalted === true) tr.classList.add("asphalted-row");

    tr.innerHTML = `
      <td class="dot-link" data-dot="${row["dot-number"]}">
        ${row["dot-number"] || ""}
      </td>
      <td>${row["mile-post"] || ""}</td>
      <td>${row.crossing_number || ""}</td>
      <td>${row.track || ""}</td>
      <td>${row.type || ""}</td>
      <td>${row.completed ? "Yes" : "No"}</td>
      <td>${row.asphalted ? "Yes" : "No"}</td>
      <td>${row.planned_footage || ""}</td>
      <td>${row.actual_footage || ""}</td>
      <td>${row.completed_by || ""}</td>
      <td>${row.date_completed || ""}</td>
      <td>${row.helped || ""}</td>
    `;

    crossingsTableBody.appendChild(tr);
  });

  // Make DOT number clickable → Google Maps
  document.querySelectorAll(".dot-link").forEach((cell) => {
    cell.addEventListener("click", () => {
      const dot = cell.dataset.dot;
      if (dot) {
        window.open(
          `https://www.google.com/maps/search/${dot} railroad crossing`,
          "_blank"
        );
      }
    });
  });
}
