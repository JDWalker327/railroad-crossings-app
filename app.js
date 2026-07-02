console.log("app start");

// ---------------------------------------------------------
// 0. HTML-escaping helper (prevents XSS via innerHTML)
// ---------------------------------------------------------
function escHtml(val) {
  if (val == null) return "";
  return String(val)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------------------------------------------------------
// 0b. Map helpers
// ---------------------------------------------------------
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

// ---------------------------------------------------------
// 1. Initialize Supabase Client
// ---------------------------------------------------------
const supabaseClient = supabase.createClient(
  "https://hbesqtcjkcjmzowhgowe.supabase.co",
  "sb_publishable_Q0n-culzSKm8afh8tArpXw_WwQZIY0Y"
);

async function incrementVisitCount() {
  console.log("Calling increment_visits...");
  const { data, error } = await supabaseClient.rpc("increment_visits");
  console.log("RPC result:", data, error);
}
incrementVisitCount();

// ---------------------------------------------------------
// 1b. RevenueCat Setup
// ---------------------------------------------------------
const RC_API_KEY = "test_vezqxpsVQsJhojZTVPszjBzzPdX";
const RC_ENTITLEMENT = "Railroad Crossings Pro";
const RC_PRODUCT_ID = "com.railroadcrossings.monthly";

let isPro = false;

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

initRevenueCat();

// ---------------------------------------------------------
// 1c. Paywall Modal Logic
// ---------------------------------------------------------
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
      if (lookupCrossingsCache.length > 0) renderLookupTable(lookupCrossingsCache);
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
      if (lookupCrossingsCache.length > 0) renderLookupTable(lookupCrossingsCache);
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

// ---------------------------------------------------------
// 2. DOM Elements (new UI)
// ---------------------------------------------------------
const dotSearch = document.getElementById("dotSearch");
const dotSearchBtn = document.getElementById("dotSearchBtn");
const subdivisionSearch = document.getElementById("subdivisionSearch");
const lookupResults = document.getElementById("lookupResults");

const crossingsTableHead = document.getElementById("crossingsTableHead");
const crossingsTableBody = document.getElementById("crossingsTableBody");

// ---------------------------------------------------------
// 3. LOOKUP MODE (DOT or Subdivision search)
// ---------------------------------------------------------
let selectedLookup = null;
let lookupCrossingsCache = [];
let lookupSearchTimer = null;

subdivisionSearch.addEventListener("input", () => {
  clearTimeout(lookupSearchTimer);
  lookupSearchTimer = setTimeout(() => {
    searchLookupSubdivisions();
  }, 300);
});

function clearLookupUI() {
  selectedLookup = null;
  lookupCrossingsCache = [];
  lookupResults.innerHTML = "";
  crossingsTableBody.innerHTML = "";
}

async function searchLookupSubdivisions() {
  const q = (subdivisionSearch.value || "").trim();

  lookupResults.innerHTML = "";
  selectedLookup = null;

  if (q.length < 2) return;

  const { data, error } = await supabaseClient
    .schema("public")
    .from("crossings_verified")
    .select("subdivision, state")
    .not("subdivision", "is", null)
    .ilike("subdivision", `%${q}%`)
    .limit(50);

  if (error) {
    lookupResults.innerHTML = `<div style="color:crimson;">${escHtml(error.message)}</div>`;
    return;
  }

  const seen = new Set();
  const rows = [];

  (data || []).forEach((r) => {
    const subdivision = (r.subdivision || "").trim();
    const state = (r.state || "").trim();
    const key = `${subdivision.toLowerCase()}|${state.toLowerCase()}`;

    if (!subdivision || seen.has(key)) return;

    seen.add(key);
    rows.push({
      subdivision,
      state,
    });
  });

  rows.sort((a, b) => {
    const bySubdivision = a.subdivision.localeCompare(b.subdivision);
    if (bySubdivision !== 0) return bySubdivision;
    return a.state.localeCompare(b.state);
  });

  if (!rows.length) {
    lookupResults.innerHTML = `<div style="opacity:0.7;">No matches</div>`;
    return;
  }

  const label = document.createElement("p");
  label.className = "subdivision-results-label";
  label.textContent = "Tap a subdivision to load its crossings:";

  const container = document.createElement("div");
  rows.forEach((r) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "subdivision-result-btn";

    btn.innerHTML = `<span><strong>${escHtml(r.subdivision)}</strong> — ${escHtml(r.state)}</span><span class="subdivision-result-arrow">›</span>`;

    btn.onclick = async () => {
      selectedLookup = r;
      lookupResults.innerHTML = `<div style="opacity:0.8;">Loading crossings for <strong>${escHtml(r.subdivision)}</strong>…</div>`;
      await loadLookupCrossingsForSubdivision();
    };

    container.appendChild(btn);
  });

  lookupResults.appendChild(label);
  lookupResults.appendChild(container);
}

async function loadLookupCrossingsForSubdivision() {
  if (!selectedLookup) return;

  const { data, error } = await supabaseClient
    .schema("public")
    .from("crossings_verified")
    .select("*")
    .eq("subdivision", selectedLookup.subdivision);

  if (error) {
    console.error(error);
    lookupResults.innerHTML = `<div style="color:crimson;">${escHtml(error.message)}</div>`;
    return;
  }

  lookupCrossingsCache = data || [];
  lookupResults.innerHTML = `<div style="opacity:0.8;"><strong>${escHtml(selectedLookup.subdivision)}</strong> — ${lookupCrossingsCache.length} crossing(s) found</div>`;
  renderLookupTable(lookupCrossingsCache);
}

// ---------------------------------------------------------
// 4. DOT Lookup
// ---------------------------------------------------------
dotSearchBtn.addEventListener("click", async () => {
  const dot = dotSearch.value.trim();
  if (!dot) return;

  const { data, error } = await supabaseClient
    .schema("public")
    .from("crossings_verified")
    .select("*")
    .ilike("dot_number", dot);

  if (error) {
    console.error(error);
    return;
  }

  renderLookupTable(data || []);
});

// ---------------------------------------------------------
// 5. TABLE RENDERING
// ---------------------------------------------------------

function renderLookupTable(rows) {
  // Remove any existing subscribe banner
  const existingBanner = document.getElementById("subscribeBanner");
  if (existingBanner) existingBanner.remove();

  rows.sort((a, b) => {
    const mpA = parseFloat(a.mile_post_num ?? a.mile_post ?? a["mile-post"]);
    const mpB = parseFloat(b.mile_post_num ?? b.mile_post ?? b["mile-post"]);
    return (isNaN(mpA) ? Number.POSITIVE_INFINITY : mpA) -
           (isNaN(mpB) ? Number.POSITIVE_INFINITY : mpB);
  });

  if (isPro) {
    crossingsTableHead.innerHTML = `
      <tr>
        <th>Map</th>
        <th>DOT #</th>
        <th>Milepost</th>
        <th>City</th>
        <th>Road Name</th>
        <th>State</th>
        <th>Subdivision</th>
        <th>Planned Footage</th>
        <th>Latitude</th>
        <th>Longitude</th>
      </tr>
    `;

    crossingsTableBody.innerHTML = "";

    rows.forEach((row) => {
      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td>${mapLinkHtml(row.latitude, row.longitude)}</td>
        <td>${escHtml(row["dot_number"] ?? row["dot-number"] ?? "")}</td>
        <td>${escHtml(row["mile_post_num"] ?? row["mile_post"] ?? row["mile-post"] ?? "")}</td>
        <td>${escHtml(row.city || "")}</td>
        <td>${escHtml(row.road_name || "")}</td>
        <td>${escHtml(row.state || "")}</td>
        <td>${escHtml(row.subdivision || "")}</td>
        <td>${escHtml(row.planned_footage || "")}</td>
        <td>${escHtml(row.latitude || "")}</td>
        <td>${escHtml(row.longitude || "")}</td>
      `;

      crossingsTableBody.appendChild(tr);
    });
  } else {
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

    rows.forEach((row) => {
      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td>${escHtml(row["dot_number"] ?? row["dot-number"] ?? "")}</td>
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
}

