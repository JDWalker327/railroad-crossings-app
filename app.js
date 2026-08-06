console.log("app start");

function escHtml(val) {
  if (val == null) return "";
  return String(val)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function hasLatLon(lat, lon) {
  return (
    lat != null &&
    lon != null &&
    String(lat).trim().length > 0 &&
    String(lon).trim().length > 0
  );
}

function googleMapsUrl(lat, lon) {
  return `https://www.google.com/maps?q=${encodeURIComponent(lat)},${encodeURIComponent(lon)}`;
}

function mapIconSvg() {
  return `
    <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" focusable="false">
      <path fill="currentColor" d="M12 2c-3.86 0-7 3.14-7 7 0 5.25 7 13 7 13s7-7.75 7-13c0-3.86-3.14-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z"/>
    </svg>
  `;
}

function mapLinkHtml(lat, lon) {
  if (!hasLatLon(lat, lon)) return "";
  const url = googleMapsUrl(lat, lon);
  return `
    <a class="map-icon-link" href="${url}" target="_blank" rel="noopener noreferrer"
       title="Open in Google Maps" aria-label="Open in Google Maps">
      ${mapIconSvg()}
    </a>
  `;
}

const SUBDIVISION_PAGE_SIZE = 1000;

function collectSubdivisionNames(rows) {
  const seen = new Set();
  const names = [];
  (rows || []).forEach((row) => {
    const name = (row.subdivision || "").trim();
    const normalized = name.toLowerCase();
    if (!name || JUNK_SUBDIVISIONS.has(normalized) || seen.has(normalized)) return;
    seen.add(normalized);
    names.push(name);
  });
  names.sort((a, b) => a.localeCompare(b));
  return names;
}

async function fetchAllSubdivisionRows(buildQuery, pageSize = SUBDIVISION_PAGE_SIZE) {
  const allRows = [];
  let from = 0;

  while (true) {
    const { data, error } = await buildQuery()
      .order("subdivision", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) return { data: null, error };

    const rows = data || [];
    allRows.push(...rows);

    if (rows.length < pageSize) {
      return { data: allRows, error: null };
    }

    from += pageSize;
  }
}

const supabaseClient = supabase.createClient(
  "https://hbesqtcjkcjmzowhgowe.supabase.co",
  "sb_publishable_Q0n-culzSKm8afh8tArpXw_WwQZIY0Y"
);

async function incrementVisitCount() {
  console.log("Calling increment_visits...");
  const { data, error } = await supabaseClient.rpc("increment_visits");
  console.log("RPC result:", data, error);
}

const RC_API_KEY = "test_vezqxpsVQsJhojZTVPszjBzzPdX";
const RC_ENTITLEMENT = "Railroad Crossings Pro";
const RC_PRODUCT_ID = "com.railroadcrossings.monthly";

// TEMP: testing branch paywall bypass
let isPro = true;

async function initRevenueCat() {
  try {
    let userId = localStorage.getItem("rc_user_id");
    if (!userId) {
      userId = crypto.randomUUID();
      localStorage.setItem("rc_user_id", userId);
    }
    Purchases.configure(RC_API_KEY, userId);
    await checkEntitlements();
  } catch (e) {
    console.error("RevenueCat init error:", e);
  }
}

async function checkEntitlements() {
  try {
    const customerInfo = await Purchases.getSharedInstance().getCustomerInfo();
    isPro = !!customerInfo.entitlements.active[RC_ENTITLEMENT];
  } catch (e) {
    console.error("Error checking entitlements:", e);
    isPro = false;
  }
}


const paywallModal = document.getElementById("paywallModal");
const paywallCloseBtn = document.getElementById("paywallCloseBtn");
const paywallSubscribeBtn = document.getElementById("paywallSubscribeBtn");
const paywallRestoreBtn = document.getElementById("paywallRestoreBtn");
const paywallStatus = document.getElementById("paywallStatus");

function openPaywall() {
  paywallModal.style.display = "flex";
  paywallStatus.textContent = "";
}

function closePaywall() {
  paywallModal.style.display = "none";
}

paywallCloseBtn.addEventListener("click", closePaywall);

paywallModal.addEventListener("click", (e) => {
  if (e.target === paywallModal) closePaywall();
});

paywallSubscribeBtn.addEventListener("click", async () => {
  paywallStatus.textContent = "Loading…";
  paywallSubscribeBtn.disabled = true;
  try {
    const offerings = await Purchases.getSharedInstance().getOfferings();
    const pkg =
      offerings.current?.availablePackages.find(
        (p) => p.rcBillingProduct?.identifier === RC_PRODUCT_ID
      ) || offerings.current?.availablePackages[0];

    if (!pkg) {
      paywallStatus.textContent = "No subscription package found.";
      paywallSubscribeBtn.disabled = false;
      return;
    }

    const { customerInfo } = await Purchases.getSharedInstance().purchasePackage(pkg);
    isPro = !!customerInfo.entitlements.active[RC_ENTITLEMENT];
    if (isPro) {
      closePaywall();
      renderActiveResults();
    } else {
      paywallStatus.textContent = "Purchase complete but entitlement not found. Please restore purchases.";
    }
  } catch (e) {
    if (e.code !== "PURCHASE_CANCELLED") {
      console.error("Purchase error:", e);
      paywallStatus.textContent = "Purchase failed. Please try again.";
    } else {
      paywallStatus.textContent = "";
    }
  } finally {
    paywallSubscribeBtn.disabled = false;
  }
});

paywallRestoreBtn.addEventListener("click", async () => {
  paywallStatus.textContent = "Restoring…";
  paywallRestoreBtn.disabled = true;
  try {
    const customerInfo = await Purchases.getSharedInstance().restorePurchases();
    isPro = !!customerInfo.entitlements.active[RC_ENTITLEMENT];
    if (isPro) {
      closePaywall();
      renderActiveResults();
    } else {
      paywallStatus.textContent = "No active subscription found.";
    }
  } catch (e) {
    console.error("Restore error:", e);
    paywallStatus.textContent = "Restore failed. Please try again.";
  } finally {
    paywallRestoreBtn.disabled = false;
  }
});

const dotSearch = document.getElementById("dotSearch");
const dotSearchBtn = document.getElementById("dotSearchBtn");
const subdivisionSelect = document.getElementById("subdivisionSelect");
const lookupResults = document.getElementById("lookupResults");
const lookupDescription = document.getElementById("lookupDescription");
const railroadStatus = document.getElementById("railroadStatus");
const classITabs = document.getElementById("classITabs");
const otherRailroadsSelect = document.getElementById("otherRailroadsSelect");
const clearRailroadFilterBtn = document.getElementById("clearRailroadFilterBtn");

const crossingsTableHead = document.getElementById("crossingsTableHead");
const crossingsTableBody = document.getElementById("crossingsTableBody");

const CLASS_I_RAILROADS = [
  { key: "bnsf", label: "BNSF", aliases: ["BNSF", "BNSF RAILWAY", "BNSF RAILWAY COMPANY"] },
  { key: "cn", label: "CN", aliases: ["CN", "CANADIAN NATIONAL", "CANADIAN NATIONAL RAILWAY"] },
  { key: "cpkc", label: "CPKC", aliases: ["CPKC", "CANADIAN PACIFIC KANSAS CITY", "KANSAS CITY SOUTHERN", "KCS"] },
  { key: "csx", label: "CSX", aliases: ["CSX", "CSX TRANSPORTATION", "CSXT"] },
  { key: "ns", label: "NS", aliases: ["NS", "NORFOLK SOUTHERN", "NORFOLK SOUTHERN RAILWAY"] },
  { key: "up", label: "Union Pacific", aliases: ["UP", "UNION PACIFIC", "UNION PACIFIC RAILROAD"] }
];

const CLASS_I_ALIAS_TO_KEY = new Map();
CLASS_I_RAILROADS.forEach((item) => {
  item.aliases.forEach((alias) => {
    CLASS_I_ALIAS_TO_KEY.set(alias, item.key);
  });
});

const JUNK_SUBDIVISIONS = new Set([".", "'", "*", "n/a", "#n/a", "na", "-", "--", "none", "unknown"]);

let selectedLookup = null;
let lookupCrossingsCache = [];
let railroadRowsCache = [];
let activeMode = "lookup";
let activeRailroadFilter = { type: "all", key: "all", label: "All Railroads" };

subdivisionSelect.addEventListener("change", async () => {
  const subdivision = subdivisionSelect.value;
  if (!subdivision) {
    clearLookupUI();
    return;
  }
  activeMode = "lookup";
  selectedLookup = { subdivision };
  lookupResults.innerHTML = `<div style="opacity:0.8;">Loading crossings for <strong>${escHtml(subdivision)}</strong>…</div>`;
  await loadLookupCrossingsForSubdivision();
});

function normalizeRailroadName(value) {
  const normalized = String(value || "")
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

  return normalized;
}

function getRailroadFilterMetadata(row) {
  const candidates = [row.railroad_abreviation, row.railroad];
  for (const candidate of candidates) {
    const normalized = normalizeRailroadName(candidate);
    if (!normalized) continue;
    const classIKey = CLASS_I_ALIAS_TO_KEY.get(normalized);
    if (classIKey) {
      const classI = CLASS_I_RAILROADS.find((item) => item.key === classIKey);
      return {
        normalized,
        classIKey,
        filterType: "classI",
        displayName: classI ? classI.label : candidate
      };
    }
  }

  const displayName = String(row.railroad || row.railroad_abreviation || "Unknown Railroad").trim() || "Unknown Railroad";
  return {
    normalized: normalizeRailroadName(displayName),
    classIKey: null,
    filterType: "other",
    displayName
  };
}

function sortRowsByMilepost(rows) {
  return [...rows].sort((a, b) => {
    const mpA = parseFloat(a.mile_post_num ?? a.mile_post ?? a["mile-post"]);
    const mpB = parseFloat(b.mile_post_num ?? b.mile_post ?? b["mile-post"]);
    return (isNaN(mpA) ? Number.POSITIVE_INFINITY : mpA) -
           (isNaN(mpB) ? Number.POSITIVE_INFINITY : mpB);
  });
}

function clearLookupUI() {
  selectedLookup = null;
  lookupCrossingsCache = [];
  lookupResults.innerHTML = "";
  if (activeMode === "lookup") {
    crossingsTableBody.innerHTML = "";
    crossingsTableHead.innerHTML = "";
  }
}

function setRailroadStatus(message, isError = false) {
  railroadStatus.textContent = message || "";
  railroadStatus.classList.toggle("error-text", isError);
}

function renderRailroadTabs() {
  classITabs.innerHTML = "";

  const allBtn = document.createElement("button");
  allBtn.type = "button";
  allBtn.className = "railroad-filter-btn";
  if (activeRailroadFilter.key === "all") allBtn.classList.add("is-active");
  allBtn.textContent = "All Railroads";
  allBtn.onclick = () => setRailroadFilter({ type: "all", key: "all", label: "All Railroads" });
  classITabs.appendChild(allBtn);

  CLASS_I_RAILROADS.forEach((railroad) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "railroad-filter-btn";
    if (activeRailroadFilter.type === "classI" && activeRailroadFilter.key === railroad.key) {
      btn.classList.add("is-active");
    }
    btn.textContent = railroad.label;
    btn.onclick = () => setRailroadFilter({ type: "classI", key: railroad.key, label: railroad.label });
    classITabs.appendChild(btn);
  });
}

async function loadAllRailroadNames() {
  otherRailroadsSelect.innerHTML = '<option value="">Loading railroads…</option>';
  otherRailroadsSelect.disabled = true;

  const { data, error } = await supabaseClient
    .schema("public")
    .from("railroads_names")
    .select("railroads")
    .order("railroads", { ascending: true });

  if (error) {
    console.error(error);
    otherRailroadsSelect.innerHTML = '<option value="">Error loading railroads</option>';
    setRailroadStatus("Error loading railroad list.", true);
    return;
  }

  const options = [];
  (data || []).forEach((row) => {
    const displayName = String(row.railroads || "").trim();
    if (!displayName) return;
    const normalized = normalizeRailroadName(displayName);
    // Skip Class I railroads — they have their own tabs
    if (CLASS_I_ALIAS_TO_KEY.has(normalized)) return;
    options.push({ value: displayName, label: displayName });
  });

  otherRailroadsSelect.innerHTML = '<option value="">Select a railroad…</option>';
  options.forEach(({ value, label }) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    if (activeRailroadFilter.type === "other" && activeRailroadFilter.key === value) {
      opt.selected = true;
    }
    otherRailroadsSelect.appendChild(opt);
  });

  otherRailroadsSelect.disabled = options.length === 0;
}

otherRailroadsSelect.addEventListener("change", async () => {
  const value = otherRailroadsSelect.value;
  if (!value) {
    await setRailroadFilter({ type: "all", key: "all", label: "All Railroads" });
    return;
  }

  const label = otherRailroadsSelect.options[otherRailroadsSelect.selectedIndex]?.textContent || "Other Railroad";
  await setRailroadFilter({ type: "other", key: value, label });
});

function filterRailroadRows(rows) {
  if (activeRailroadFilter.key === "all") return rows;

  return rows.filter((row) => {
    const metadata = getRailroadFilterMetadata(row);
    if (activeRailroadFilter.type === "classI") {
      return metadata.classIKey === activeRailroadFilter.key;
    }
    if (activeRailroadFilter.type === "other") {
      const selectedName = String(activeRailroadFilter.key || "").trim().toUpperCase();
      const rowRailroad = String(row.railroad || "").trim().toUpperCase();
      return rowRailroad === selectedName;
    }
    return true;
  });
}

function renderRailroadTable(rows) {
  renderLookupTable(rows, { isRailroadMode: true });
}

function renderActiveResults() {
  if (activeMode === "railroads") {
    const filteredRows = filterRailroadRows(railroadRowsCache);
    renderRailroadTable(filteredRows);
    const countLabel = filteredRows.length === 1 ? "crossing" : "crossings";
    setRailroadStatus(`${activeRailroadFilter.label}: ${filteredRows.length} ${countLabel}`);
    return;
  }

  renderLookupTable(lookupCrossingsCache);
}

async function setRailroadFilter(nextFilter) {
  activeMode = "railroads";
  activeRailroadFilter = nextFilter;
  if (nextFilter.type !== "other") {
    otherRailroadsSelect.value = "";
  }
  // Update lookup description to reflect selected railroad
  const railroadName = nextFilter.type === "all" ? "" : nextFilter.label;
  lookupDescription.textContent = railroadName
    ? `Search all ${railroadName} crossings by DOT number or subdivision.`
    : "Search all crossings by DOT number or subdivision.";
  // Clear stale subdivision selection and results when railroad changes
  if (subdivisionSelect.value) {
    subdivisionSelect.value = "";
    lookupResults.innerHTML = "";
    selectedLookup = null;
  }

  await loadSubdivisionDropdown();
  renderRailroadTabs();
  renderActiveResults();
}

clearRailroadFilterBtn.addEventListener("click", async () => {
  await setRailroadFilter({ type: "all", key: "all", label: "All Railroads" });
});

async function loadRailroads() {
  setRailroadStatus("Loading railroads…");

  const { data, error } = await supabaseClient
    .schema("public")
    .from("railroads")
    .select("dot_number, railroad, railroad_abreviation, subdivision, road_name, city, state, mile_post_num, type, latitude, longitude")
    .order("railroad", { ascending: true });

  if (error) {
    console.error(error);
    setRailroadStatus(error.message, true);
    return;
  }

  railroadRowsCache = data || [];
  renderRailroadTabs();
  renderActiveResults();
}

async function loadSubdivisionDropdown() {
  subdivisionSelect.innerHTML = '<option value="">Loading subdivisions…</option>';
  subdivisionSelect.disabled = true;

  const buildQuery = () => {
    let query = supabaseClient
      .schema("public")
      .from("railroads")
      .select("subdivision")
      .not("subdivision", "is", null);

    if (activeRailroadFilter.type === "classI") {
      const railroad = CLASS_I_RAILROADS.find((r) => r.key === activeRailroadFilter.key);
      if (railroad && railroad.aliases.length > 0) {
        query = query.in("railroad_abreviation", railroad.aliases);
      }
    } else if (activeRailroadFilter.type === "other") {
      query = query.ilike("railroad", activeRailroadFilter.key);
    }

    return query;
  };
  const { data, error } = await fetchAllSubdivisionRows(buildQuery);

  if (error) {
    console.error(error);
    subdivisionSelect.innerHTML = '<option value="">Error loading subdivisions</option>';
    return;
  }

  const names = collectSubdivisionNames(data);

  subdivisionSelect.innerHTML = '<option value="">Select a subdivision…</option>';
  names.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    subdivisionSelect.appendChild(opt);
  });
  subdivisionSelect.disabled = names.length === 0;
}

if (typeof module !== "undefined") {
  module.exports = {
    collectSubdivisionNames,
    fetchAllSubdivisionRows,
    SUBDIVISION_PAGE_SIZE,
  };
}

async function loadLookupCrossingsForSubdivision() {
  if (!selectedLookup) return;
  activeMode = "lookup";

  // Use dedicated table for selected Class I railroad; otherwise use railroads
  const lookupTable =
    activeRailroadFilter.type === "classI" &&
    ["bnsf", "cn", "cpkc", "csx", "ns", "up"].includes(activeRailroadFilter.key)
      ? activeRailroadFilter.key
      : "railroads";

  let query = supabaseClient
    .schema("public")
    .from(lookupTable)
    .select("*")
    .eq("subdivision", selectedLookup.subdivision);

  if (activeRailroadFilter.type === "classI") {
    // Only apply abbreviation filter when querying shared railroads table
    if (lookupTable === "railroads") {
      const railroad = CLASS_I_RAILROADS.find((r) => r.key === activeRailroadFilter.key);
      if (railroad && railroad.aliases.length > 0) {
        query = query.in("railroad_abreviation", railroad.aliases);
      }
    }
  } else if (activeRailroadFilter.type === "other") {
    query = query.ilike("railroad", activeRailroadFilter.key);
  }

  const { data, error } = await query;

  if (error) {
    console.error(error);
    lookupResults.innerHTML = `<div style="color:crimson;">${escHtml(error.message)}</div>`;
    return;
  }

  lookupCrossingsCache = data || [];
  lookupResults.innerHTML = `<div style="opacity:0.8;"><strong>${escHtml(selectedLookup.subdivision)}</strong> — ${lookupCrossingsCache.length} crossing(s) found</div>`;
  renderActiveResults();
}

dotSearchBtn.addEventListener("click", async () => {
  activeMode = "lookup";
  const dot = dotSearch.value.trim();
  if (!dot) return;

  // Use dedicated table for selected Class I railroad; otherwise use railroads
  const lookupTable =
    activeRailroadFilter.type === "classI" &&
    ["bnsf", "cn", "cpkc", "csx", "ns", "up"].includes(activeRailroadFilter.key)
      ? activeRailroadFilter.key
      : "railroads";

  let query = supabaseClient
    .schema("public")
    .from(lookupTable)
    .select("*")
    .ilike("dot_number", dot);

  if (activeRailroadFilter.type === "classI") {
    // Only apply abbreviation filter when querying shared railroads table
    if (lookupTable === "railroads") {
      const railroad = CLASS_I_RAILROADS.find((r) => r.key === activeRailroadFilter.key);
      if (railroad && railroad.aliases.length > 0) {
        query = query.in("railroad_abreviation", railroad.aliases);
      }
    }
  } else if (activeRailroadFilter.type === "other") {
    query = query.ilike("railroad", activeRailroadFilter.key);
  }

  const { data, error } = await query;

  if (error) {
    console.error(error);
    return;
  }

  lookupCrossingsCache = data || [];
  renderActiveResults();
});

function renderLookupTable(rows, options = {}) {
  const { isRailroadMode = false } = options;
  const existingBanner = document.getElementById("subscribeBanner");
  if (existingBanner) existingBanner.remove();

  const sortedRows = sortRowsByMilepost(rows || []);

  if (isRailroadMode || isPro) {
    crossingsTableHead.innerHTML = `
      <tr>
        <th>Map</th>
        <th>DOT#</th>
        <th>Milepost</th>
        <th>City</th>
        <th>State</th>
        <th>Road Name</th>
        <th>Subdivision</th>
        <th>Latitude</th>
        <th>Longitude</th>
      </tr>
    `;

    crossingsTableBody.innerHTML = "";

    sortedRows.forEach((row) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${mapLinkHtml(row.latitude, row.longitude)}</td>
        <td>${escHtml(row.dot_number ?? row["dot-number"] ?? "")}</td>
        <td>${escHtml(row.mile_post_num ?? row.mile_post ?? row["mile-post"] ?? "")}</td>
        <td>${escHtml(row.city || "")}</td>
        <td>${escHtml(row.state || "")}</td>
        <td>${escHtml(row.road_name || "")}</td>
        <td>${escHtml(row.subdivision || "")}</td>
        <td>${escHtml(row.latitude || "")}</td>
        <td>${escHtml(row.longitude || "")}</td>
      `;
      crossingsTableBody.appendChild(tr);
    });

    if (!sortedRows.length) {
      crossingsTableBody.innerHTML = '<tr><td colspan="9" class="empty-state-cell">No crossings found for this filter.</td></tr>';
    }
    return;
  }

  crossingsTableHead.innerHTML = `
    <tr>
      <th>DOT #</th>
      <th class="locked-col">🔒 Milepost</th>
      <th class="locked-col">🔒 City</th>
      <th class="locked-col">🔒 Road Name</th>
      <th class="locked-col">🔒 State</th>
      <th class="locked-col">🔒 Subdivision</th>
      <th class="locked-col">🔒 Map &amp; More</th>
    </tr>
  `;

  crossingsTableBody.innerHTML = "";

  sortedRows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escHtml(row.dot_number ?? row["dot-number"] ?? "")}</td>
      <td class="locked-cell">—</td>
      <td class="locked-cell">—</td>
      <td class="locked-cell">—</td>
      <td class="locked-cell">—</td>
      <td class="locked-cell">—</td>
      <td class="locked-cell">—</td>
    `;
    crossingsTableBody.appendChild(tr);
  });

  const banner = document.createElement("div");
  banner.id = "subscribeBanner";
  banner.className = "subscribe-banner";
  banner.innerHTML = `🔒 Subscribe to see full details <button class="subscribe-banner-btn" id="openPaywallBtn">Subscribe Now</button>`;
  document.getElementById("tableContainer").appendChild(banner);

  document.getElementById("openPaywallBtn").onclick = openPaywall;
}

if (typeof module === "undefined") {
  incrementVisitCount();
  initRevenueCat();
  renderRailroadTabs();
  loadAllRailroadNames();
  loadRailroads();
  loadSubdivisionDropdown();
}
