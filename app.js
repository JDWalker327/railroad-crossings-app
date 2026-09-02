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

function googleMapsDirectionsUrl(lat, lon) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(lat)},${encodeURIComponent(lon)}`;
}

function firstDefinedPropertyValue(obj, keys) {
  for (const key of keys) {
    const value = obj && obj[key];
    if (value != null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "N/A";
}

const MAP_MILEPOST_KEYS = ["mile_post_num", "milepost", "MILEPOST", "mp", "mile_post"];
const MAP_SUBDIVISION_KEYS = ["subdivision", "subdivision_name", "sub", "SUBDIVISION"];

function formatMapMarkerInfoText(props = {}, escapeValues = false) {
  const milepostValue = firstDefinedPropertyValue(props, MAP_MILEPOST_KEYS);
  const subdivisionValue = firstDefinedPropertyValue(props, MAP_SUBDIVISION_KEYS);
  const milepost = escapeValues ? escHtml(milepostValue) : milepostValue;
  const subdivision = escapeValues ? escHtml(subdivisionValue) : subdivisionValue;
  return `Milepost ${milepost} · ${subdivision}`;
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
const RC_ENTITLEMENT = "premium";
const RC_PRODUCT_ID = "railroad_crossings_monthly";

// ── RevenueCat SDK safe accessor ────────────────────────────────────────────
//
// The RevenueCat Web Billing SDK is loaded from a CDN via a <script> tag
// before app.js, so window.Purchases should already be set by the time this
// file runs. If that script failed to load (blocked/slow CDN, offline,
// ad-blocker, etc.) window.Purchases will simply be undefined. Always read
// the SDK through this accessor instead of referencing the bare `Purchases`
// global, which throws a ReferenceError when the identifier was never
// declared.
function getPurchasesSdk() {
  if (typeof window === "undefined") return undefined;
  const sdk = window.Purchases;
  if (!sdk) return undefined;
  // The official RevenueCat Web Billing UMD bundle exposes its API as
  // window.Purchases.Purchases (a namespace object wrapping the SDK class)
  // rather than window.Purchases itself. Unwrap it defensively so RC.configure
  // / RC.getSharedInstance keep working regardless of which shape loads
  // (e.g. in tests, a flat mock is assigned directly to window.Purchases).
  if (typeof sdk.configure === "function" && typeof sdk.getSharedInstance === "function") {
    return sdk;
  }
  if (sdk.Purchases && typeof sdk.Purchases.configure === "function") {
    return sdk.Purchases;
  }
  return sdk;
}

const RC = getPurchasesSdk();

// Capability flag computed once at startup so billing UI can be gated
// (disabled/hidden) instead of crashing when the SDK isn't available.
const isPurchasesSdkAvailable = !!RC;

// Tracks whether RC.configure() has completed successfully. changeUser() is
// only available on the instance returned by RC.getSharedInstance() once
// configure() has run, so the Subscribe flow gates its changeUser() call on
// this flag instead of assuming the SDK is ready as soon as the page loads.
let isRevenueCatConfigured = false;

// changeUser (used to link the Stripe/email identity before checkout — see
// handlePaywallSubscribe) lives on the *instance* returned by
// RC.getSharedInstance(), not on the SDK class itself, so it can't be
// confirmed structurally without invoking the SDK (which may require
// configure() to have run first). This flag just confirms the resolved SDK
// shape exposes getSharedInstance at all, i.e. that attempting
// RC.getSharedInstance().changeUser(...) is meaningful rather than
// guaranteed to throw "getSharedInstance is not a function".
const isChangeUserCapable = !!(RC && typeof RC.getSharedInstance === "function");

// Production default: users are locked/free until entitlement is confirmed.
let isPro = false;

function hasActiveEntitlement(customerInfo) {
  return !!customerInfo?.entitlements?.active?.[RC_ENTITLEMENT];
}

function getIsPro() {
  return isPro;
}

// ── Email identity (Stripe customer ↔ RevenueCat App User ID mapping) ─────
//
// Stripe checkout/billing-portal and RevenueCat both need a stable
// identifier per user. This app has no account system, so the user's email
// address (entered once at subscribe time) is used as that identifier for
// both systems.
const USER_EMAIL_STORAGE_KEY = "user_email";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email) {
  return typeof email === "string" && EMAIL_PATTERN.test(email.trim());
}

function getStoredUserEmail(store = (typeof localStorage !== "undefined" ? localStorage : null)) {
  if (!store || typeof store.getItem !== "function") return "";
  try {
    return store.getItem(USER_EMAIL_STORAGE_KEY) || "";
  } catch (error) {
    console.warn("Unable to read stored user email:", error);
    return "";
  }
}

function persistUserEmail(email, store = (typeof localStorage !== "undefined" ? localStorage : null)) {
  if (!store || typeof store.setItem !== "function") return;
  try {
    store.setItem(USER_EMAIL_STORAGE_KEY, email.trim().toLowerCase());
  } catch (error) {
    console.warn("Unable to persist user email:", error);
  }
}

async function initRevenueCat() {
  if (!RC) {
    // No-op gracefully: the SDK never loaded, so there's nothing to
    // configure. Skip straight to the conservative locked/free entitlement
    // check below rather than throwing a ReferenceError on a bare
    // `Purchases` reference.
    console.warn(
      "RevenueCat init skipped: RevenueCat Web Billing SDK (window.Purchases) is not loaded."
    );
  } else {
    try {
      const storedEmail = getStoredUserEmail();
      let userId;
      if (isValidEmail(storedEmail)) {
        // Prefer the email once known so RevenueCat's App User ID matches the
        // Stripe customer email used for checkout/billing-portal.
        userId = storedEmail.trim().toLowerCase();
      } else {
        userId = localStorage.getItem("rc_user_id");
        if (!userId) {
          userId = crypto.randomUUID();
          localStorage.setItem("rc_user_id", userId);
        }
      }
      RC.configure(RC_API_KEY, userId);
      // Mark as configured only after configure() succeeds
      isRevenueCatConfigured = true;
    } catch (e) {
      console.error("RevenueCat init error:", e);
    }
  }

  // Always check entitlements (even if configure failed/was skipped above)
  // so isPro reflects the conservative locked/free default, then refresh
  // the UI and billing capability gating.
  await checkEntitlements();
  refreshBillingCapabilityUi();
  if (typeof renderActiveResults === "function") {
    renderActiveResults();
  }
}

async function checkEntitlements() {
  if (!RC) {
    // Safe default: no SDK means no confirmed entitlement. Never throw —
    // the app must stay usable (in its locked/free state) without it.
    console.warn(
      "RevenueCat entitlement check skipped: RevenueCat Web Billing SDK (window.Purchases) is not loaded."
    );
    isPro = false;
    return;
  }

  try {
    const customerInfo = await RC.getSharedInstance().getCustomerInfo();
    isPro = hasActiveEntitlement(customerInfo);
  } catch (e) {
    console.error("RevenueCat error checking entitlements:", e);
    // Preserve locked/free state on error — never accidentally unlock.
    isPro = false;
  }
}

// ── Stripe checkout / billing portal ───────────────────────────────────────
//
// These call the server-side endpoints under /api (Stripe secret key stays
// server-side only) and return the Stripe-hosted redirect URL. See README
// for required env vars and local testing instructions.

async function requestStripeUrl(endpoint, email, fetchImpl = (typeof fetch !== "undefined" ? fetch : null)) {
  if (typeof fetchImpl !== "function") {
    throw new Error("Network requests are not available in this environment.");
  }

  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
  } catch (error) {
    throw new Error("Unable to reach the server. Please check your connection and try again.");
  }

  let data = {};
  try {
    data = await response.json();
  } catch (error) {
    data = {};
  }

  if (!response.ok) {
    throw new Error(data?.error || "The server returned an unexpected error. Please try again.");
  }
  if (!data?.url) {
    throw new Error("The server did not return a redirect URL. Please try again.");
  }
  return data.url;
}

async function requestStripeCheckoutUrl(email, fetchImpl) {
  return requestStripeUrl("/api/create-checkout-session", email, fetchImpl);
}

async function requestStripeBillingPortalUrl(email, fetchImpl) {
  return requestStripeUrl("/api/create-portal-session", email, fetchImpl);
}

const paywallModal = document.getElementById("paywallModal");
const paywallCloseBtn = document.getElementById("paywallCloseBtn");
const paywallSubscribeBtn = document.getElementById("paywallSubscribeBtn");
const paywallManageBtn = document.getElementById("paywallManageBtn");
const paywallEmailInput = document.getElementById("paywallEmailInput");
const paywallRestoreBtn = document.getElementById("paywallRestoreBtn");
const paywallStatus = document.getElementById("paywallStatus");
const installSection = document.getElementById("installSection");
const installPromptText = document.getElementById("installPromptText");
const installAppBtn = document.getElementById("installAppBtn");
const installDismissBtn = document.getElementById("installDismissBtn");
const installHelpBtn = document.getElementById("installHelpBtn");
const installHelpPanel = document.getElementById("installHelpPanel");
const installFallbackText = document.getElementById("installFallbackText");
const installStatus = document.getElementById("installStatus");

const INSTALL_BANNER_DISMISSED_KEY = "install_banner_dismissed";
let deferredInstallPromptEvent = null;
let isInstallHelpExpanded = false;
let isInstallBannerDismissed = false;

function getPersistedInstallBannerDismissed(store = (typeof localStorage !== "undefined" ? localStorage : null)) {
  if (!store || typeof store.getItem !== "function") return false;
  try {
    return store.getItem(INSTALL_BANNER_DISMISSED_KEY) === "1";
  } catch (error) {
    console.warn("Unable to read install banner dismissal:", error);
    return false;
  }
}

function persistInstallBannerDismissed(value, store = (typeof localStorage !== "undefined" ? localStorage : null)) {
  if (!store || typeof store.setItem !== "function") return;
  try {
    store.setItem(INSTALL_BANNER_DISMISSED_KEY, value ? "1" : "0");
  } catch (error) {
    console.warn("Unable to persist install banner dismissal:", error);
  }
}

function getInstallContext(env = {}) {
  const win = Object.prototype.hasOwnProperty.call(env, "window")
    ? env.window
    : (typeof window !== "undefined" ? window : null);
  const nav = Object.prototype.hasOwnProperty.call(env, "navigator")
    ? env.navigator
    : (typeof navigator !== "undefined" ? navigator : null);
  const userAgent = String(env.userAgent ?? nav?.userAgent ?? "");
  const maxTouchPoints = Number(env.maxTouchPoints ?? nav?.maxTouchPoints ?? 0);
  const isIOS =
    /iphone|ipad|ipod/.test(userAgent.toLowerCase()) ||
    (userAgent.includes("Macintosh") && maxTouchPoints > 1);
  const isStandalone =
    !!nav?.standalone ||
    !!(win && typeof win.matchMedia === "function" && win.matchMedia("(display-mode: standalone)").matches);

  return { isIOS, isStandalone };
}

function getInstallUiState({ hasDeferredPrompt = false, isIOS = false, isStandalone = false, isDismissed = false } = {}) {
  if (isStandalone || isDismissed) {
    return {
      showSection: false,
      showInstallButton: false,
      showDismissButton: false,
      showHelpButton: false,
      primaryMessage: "",
      helpButtonLabel: "How",
      fallbackMessage: "",
      autoExpandHelp: false,
    };
  }

  return {
    showSection: true,
    showInstallButton: true,
    showDismissButton: true,
    showHelpButton: true,
    primaryMessage: "Install this app for faster access: use your browser menu and tap ‘Add to Home Screen’.",
    helpButtonLabel: "How",
    fallbackMessage: hasDeferredPrompt
      ? ""
      : "Don’t see Install? Open the browser menu and choose ‘Add to Home Screen’. On iPhone, use Safari → Share → Add to Home Screen.",
    autoExpandHelp: isIOS && !hasDeferredPrompt,
  };
}

function getInstallHelpContent({ isIOS = false } = {}) {
  return {
    sections: [
      {
        title: "Install on Android",
        steps: [
          "Open this app in Chrome (or Edge).",
          "Tap the browser menu (⋮).",
          "Tap Install app or Add to Home screen.",
          "Confirm Install.",
        ],
      },
      {
        title: "Install on iPhone",
        steps: [
          "Open this app in Safari.",
          "Tap the Share button.",
          "Scroll and tap Add to Home Screen.",
          "Tap Add.",
        ],
      },
    ],
    defaultSectionIndex: isIOS ? 1 : 0,
  };
}

function setInstallStatus(message = "") {
  if (installStatus) {
    installStatus.textContent = message;
  }
}

function renderInstallHelpPanel(content) {
  if (!installHelpPanel || !content) return;
  const sections = (content.sections || [])
    .map((section) => {
      const stepsHtml = (section.steps || [])
        .map((step) => `<li>${escHtml(step)}</li>`)
        .join("");
      return `
        <h3 class="install-help-title">${escHtml(section.title || "Install this app")}</h3>
        <ol class="install-help-list">${stepsHtml}</ol>
      `;
    })
    .join("");
  installHelpPanel.innerHTML = sections;
}

function refreshInstallUi() {
  if (!installSection) return;

  const context = getInstallContext();
  const uiState = getInstallUiState({
    hasDeferredPrompt: !!deferredInstallPromptEvent,
    isIOS: context.isIOS,
    isStandalone: context.isStandalone,
    isDismissed: isInstallBannerDismissed,
  });

  installSection.hidden = !uiState.showSection;
  if (installPromptText) {
    installPromptText.textContent = uiState.primaryMessage;
  }
  if (installAppBtn) {
    installAppBtn.hidden = !uiState.showInstallButton;
    installAppBtn.textContent = "Install";
  }
  if (installDismissBtn) {
    installDismissBtn.hidden = !uiState.showDismissButton;
    installDismissBtn.textContent = "Not now";
  }
  if (installHelpBtn) {
    installHelpBtn.hidden = !uiState.showHelpButton;
    installHelpBtn.textContent = uiState.helpButtonLabel;
  }
  if (installFallbackText) {
    installFallbackText.textContent = uiState.fallbackMessage;
  }

  renderInstallHelpPanel(getInstallHelpContent({ isIOS: context.isIOS }));
  const shouldShowHelp = uiState.autoExpandHelp || isInstallHelpExpanded;
  if (installHelpPanel) {
    installHelpPanel.hidden = !shouldShowHelp;
  }
}

function toggleInstallHelp(forceExpanded) {
  if (!installHelpPanel) return;
  const shouldExpand = typeof forceExpanded === "boolean"
    ? forceExpanded
    : installHelpPanel.hidden;
  isInstallHelpExpanded = shouldExpand;
  refreshInstallUi();
}

async function handleInstallButtonClick() {
  if (!deferredInstallPromptEvent) {
    toggleInstallHelp(true);
    setInstallStatus("Install prompt unavailable. Use the manual steps below.");
    return;
  }

  const promptEvent = deferredInstallPromptEvent;
  await promptEvent.prompt();
  deferredInstallPromptEvent = null;
  const userChoice = await promptEvent.userChoice;

  if (userChoice?.outcome === "accepted") {
    setInstallStatus("Install prompt accepted. The app should appear on your home screen shortly.");
  } else {
    setInstallStatus("Install prompt dismissed. You can still install later from the help steps.");
  }

  refreshInstallUi();
}

function dismissInstallBanner() {
  isInstallBannerDismissed = true;
  isInstallHelpExpanded = false;
  setInstallStatus("");
  persistInstallBannerDismissed(true);
  refreshInstallUi();
}

function registerServiceWorker() {
  if (typeof window === "undefined" || typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return Promise.resolve(null);
  }

  const register = () =>
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.error("Service worker registration failed:", error);
    });

  if (typeof document !== "undefined" && document.readyState === "complete") {
    return register();
  }

  if (typeof window.addEventListener === "function") {
    return new Promise((resolve) => {
      window.addEventListener("load", () => {
        resolve(register());
      }, { once: true });
    });
  }

  return register();
}

// User-facing message shown whenever a billing action is gated off because
// the RevenueCat Web Billing SDK never loaded.
const PURCHASES_UNAVAILABLE_MESSAGE =
  "Subscription service is unavailable right now. Please refresh the page and try again.";

// Disable/annotate the purchase-dependent paywall actions (Subscribe,
// Restore) when the SDK capability isn't available, so the buttons never
// trigger an unsafe SDK call. The Manage Subscription button stays enabled
// since it only talks to our own server (see requestStripeBillingPortalUrl)
// and already fails gracefully on its own.
function refreshBillingCapabilityUi() {
  if (!isPurchasesSdkAvailable) {
    if (paywallRestoreBtn) paywallRestoreBtn.disabled = true;
  }
}

function openPaywall() {
  paywallModal.style.display = "flex";
  paywallStatus.textContent = isPurchasesSdkAvailable ? "" : PURCHASES_UNAVAILABLE_MESSAGE;
  if (paywallEmailInput && !paywallEmailInput.value) {
    paywallEmailInput.value = getStoredUserEmail();
  }
  refreshBillingCapabilityUi();
}

function closePaywall() {
  paywallModal.style.display = "none";
}

paywallCloseBtn.addEventListener("click", closePaywall);

paywallModal.addEventListener("click", (e) => {
  if (e.target === paywallModal) closePaywall();
});

paywallSubscribeBtn.addEventListener("click", () => {
  const email = (paywallEmailInput?.value || getStoredUserEmail() || "").trim();
  if (email) persistUserEmail(email);
  window.location.href = "https://pay.rev.cat/ovpvigulhionjfpq/";
});

if (paywallManageBtn) {
  paywallManageBtn.addEventListener("click", async () => {
    const email = (paywallEmailInput?.value || getStoredUserEmail() || "").trim();
    if (!isValidEmail(email)) {
      paywallStatus.textContent = "Please enter the email you subscribed with to manage your subscription.";
      return;
    }

    persistUserEmail(email);
    paywallStatus.textContent = "Opening billing portal…";
    paywallManageBtn.disabled = true;
    try {
      const portalUrl = await requestStripeBillingPortalUrl(email);
      window.location.href = portalUrl;
    } catch (e) {
      // requestStripeUrl() already turns network/parse/server failures into
      // a friendly Error (e.g. "Billing portal is not configured..."), so
      // this never surfaces a raw stack trace to the user.
      console.error("Billing portal error:", e);
      paywallStatus.textContent = e.message || "Unable to open the billing portal. Please try again.";
      paywallManageBtn.disabled = false;
    }
  });
}

paywallRestoreBtn.addEventListener("click", async () => {
  if (!isPurchasesSdkAvailable) {
    console.error(
      "RevenueCat restore blocked: Web Billing SDK (window.Purchases) is not loaded."
    );
    paywallStatus.textContent = PURCHASES_UNAVAILABLE_MESSAGE;
    paywallRestoreBtn.disabled = true;
    return;
  }

  paywallStatus.textContent = "Restoring…";
  paywallRestoreBtn.disabled = true;
  try {
    const customerInfo = await RC.getSharedInstance().restorePurchases();
    isPro = hasActiveEntitlement(customerInfo);
    if (isPro) {
      closePaywall();
      renderActiveResults();
    } else {
      paywallStatus.textContent = "No active subscription found.";
    }
  } catch (e) {
    console.error("RevenueCat restore error:", e);
    paywallStatus.textContent = "Restore failed. Please try again.";
  } finally {
    paywallRestoreBtn.disabled = false;
  }
});

const dotSearch = document.getElementById("dotSearch");
const dotSearchBtn = document.getElementById("dotSearchBtn");
const subdivisionSearch = document.getElementById("subdivisionSearch");
const subdivisionResults = document.getElementById("subdivisionResults");
const loadAllSubdivisionsBtn = document.getElementById("loadAllSubdivisionsBtn");
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

const CLASS_I_TABLES = new Set(["bnsf", "cn", "cpkc", "csx", "ns", "up"]);

const JUNK_SUBDIVISIONS = new Set([".", "'", "*", "n/a", "#n/a", "na", "-", "--", "none", "unknown"]);

let selectedLookup = null;
let lookupCrossingsCache = [];
let railroadRowsCache = [];
let availableSubdivisionNames = [];
let activeMode = "lookup";
let activeRailroadFilter = { type: "all", key: "all", label: "All Railroads" };
let latestSubdivisionSearchToken = 0;
const subdivisionPrefixCache = new Map();
let hasLoadedAllClassISubdivisions = false;

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

function isClassISubdivisionSearchEnabled(filter = activeRailroadFilter) {
  return filter?.type === "classI" && CLASS_I_TABLES.has(filter.key);
}

function filterSubdivisionNames(names, query) {
  const trimmedQuery = String(query || "").trim().toLowerCase();
  if (!trimmedQuery) return [...(names || [])];

  return (names || []).filter((name) =>
    String(name || "").toLowerCase().startsWith(trimmedQuery)
  );
}

function shouldDeferClassISubdivisionLoad(filter = activeRailroadFilter, forceFullLoad = false) {
  return isClassISubdivisionSearchEnabled(filter) && !forceFullLoad;
}

function renderSubdivisionOptions(names, selectedValue = "") {
  subdivisionSelect.innerHTML = '<option value="">Select a subdivision…</option>';

  (names || []).forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    subdivisionSelect.appendChild(opt);
  });

  subdivisionSelect.disabled = (names || []).length === 0;
  if (selectedValue && (names || []).includes(selectedValue)) {
    subdivisionSelect.value = selectedValue;
  }
}

function syncSubdivisionSearchMode(filter = activeRailroadFilter) {
  const enableSearch = isClassISubdivisionSearchEnabled(filter);
  const showLoadAllButton = enableSearch && !hasLoadedAllClassISubdivisions;
  // Toggle searchable filtering only for the six Class I railroads; all other
  // railroads keep the original dropdown-only subdivision behavior.
  subdivisionSearch.hidden = !enableSearch;
  subdivisionSearch.disabled = !enableSearch;
  loadAllSubdivisionsBtn.hidden = !showLoadAllButton;
  loadAllSubdivisionsBtn.disabled = !showLoadAllButton;
  // For Class I, use the autocomplete results div instead of the select.
  subdivisionSelect.hidden = enableSearch;
  subdivisionResults.hidden = true;
  if (!enableSearch) {
    subdivisionSearch.value = "";
    subdivisionSearch.setAttribute("aria-expanded", "false");
    subdivisionResults.innerHTML = "";
  }
}

function applySubdivisionSearchFilter() {
  const previousSelection = subdivisionSelect.value;
  const filteredNames = isClassISubdivisionSearchEnabled()
    ? filterSubdivisionNames(availableSubdivisionNames, subdivisionSearch.value)
    : [...availableSubdivisionNames];

  if (isClassISubdivisionSearchEnabled()) {
    renderSubdivisionAutocomplete(filteredNames);
  } else {
    renderSubdivisionOptions(filteredNames, previousSelection);
    if (previousSelection && subdivisionSelect.value !== previousSelection) {
      clearLookupUI();
    }
  }

}

function renderSubdivisionAutocomplete(names) {
  subdivisionResults.innerHTML = "";
  if (!names || names.length === 0) {
    if (subdivisionSearch.value.trim()) {
      const msg = document.createElement("p");
      msg.className = "subdivision-results-label";
      msg.textContent = "No subdivisions found for that prefix.";
      subdivisionResults.appendChild(msg);
      subdivisionResults.hidden = false;
      subdivisionSearch.setAttribute("aria-expanded", "true");
    } else {
      subdivisionResults.hidden = true;
      subdivisionSearch.setAttribute("aria-expanded", "false");
    }
    return;
  }
  const fragment = document.createDocumentFragment();
  names.forEach((name) => {
    const item = document.createElement("div");
    item.setAttribute("role", "listitem");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "subdivision-result-btn";
    const span = document.createElement("span");
    span.textContent = name;
    const arrow = document.createElement("span");
    arrow.className = "subdivision-result-arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "›";
    btn.appendChild(span);
    btn.appendChild(arrow);
    btn.addEventListener("click", () => {
      subdivisionSearch.value = name;
      subdivisionSearch.setAttribute("aria-expanded", "false");
      subdivisionResults.hidden = true;
      subdivisionResults.innerHTML = "";
      selectSubdivision(name);
    });
    item.appendChild(btn);
    fragment.appendChild(item);
  });
  subdivisionResults.appendChild(fragment);
  subdivisionResults.hidden = false;
  subdivisionSearch.setAttribute("aria-expanded", "true");
}

async function selectSubdivision(subdivision) {
  activeMode = "lookup";
  selectedLookup = { subdivision };
  lookupResults.innerHTML = `<div style="opacity:0.8;">Loading crossings for <strong>${escHtml(subdivision)}</strong>…</div>`;
  await loadLookupCrossingsForSubdivision();
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
  updateActiveRailroadLabel(nextFilter);
  updateRailroadBrowserPanel(nextFilter);
  if (nextFilter.type !== "other") {
    otherRailroadsSelect.value = "";
  }
  // Update lookup description to reflect selected railroad
  const railroadName = nextFilter.type === "all" ? "" : nextFilter.label;
  lookupDescription.textContent = railroadName
    ? `Search all ${railroadName} crossings by DOT number or subdivision.`
    : "Search all crossings by DOT number or subdivision.";
  // Always reset subdivision context when the railroad filter changes so stale
  // options are never visible while the new list is loading.
  availableSubdivisionNames = [];
  hasLoadedAllClassISubdivisions = false;
  subdivisionPrefixCache.clear();
  latestSubdivisionSearchToken += 1;
  syncSubdivisionSearchMode(nextFilter);
  subdivisionSelect.value = "";
  subdivisionSelect.innerHTML = '<option value="">Loading subdivisions…</option>';
  subdivisionSelect.disabled = true;
  lookupResults.innerHTML = "";
  selectedLookup = null;
  lookupCrossingsCache = [];

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

async function loadSubdivisionDropdown({ forceFullLoad = false } = {}) {
  availableSubdivisionNames = [];
  syncSubdivisionSearchMode(activeRailroadFilter);
  subdivisionSelect.innerHTML = '<option value="">Loading subdivisions…</option>';
  subdivisionSelect.disabled = true;

  // Snapshot the filter so we can detect if the user changed railroad while
  // the async fetch was in flight and discard stale results.
  const snapshotFilter = activeRailroadFilter;

  const isClassITable =
    snapshotFilter.type === "classI" &&
    CLASS_I_TABLES.has(snapshotFilter.key);

  if (shouldDeferClassISubdivisionLoad(snapshotFilter, forceFullLoad)) {
    subdivisionSelect.innerHTML = '<option value="">Type a prefix to search subdivisions…</option>';
    subdivisionSelect.disabled = true;
    return;
  }

  const buildQuery = () => {
    const tableName = isClassITable ? snapshotFilter.key : "railroads";
    let query = supabaseClient
      .schema("public")
      .from(tableName)
      .select("subdivision")
      .not("subdivision", "is", null);

    if (!isClassITable && snapshotFilter.type === "classI") {
      const railroad = CLASS_I_RAILROADS.find((r) => r.key === snapshotFilter.key);
      if (railroad && railroad.aliases.length > 0) {
        query = query.in("railroad_abreviation", railroad.aliases);
      }
    } else if (snapshotFilter.type === "other") {
      query = query.ilike("railroad", snapshotFilter.key);
    }

    return query;
  };
  const { data, error } = await fetchAllSubdivisionRows(buildQuery);

  // If the user switched railroads while this fetch was in flight, discard results.
  if (activeRailroadFilter !== snapshotFilter) {
    return;
  }

  if (error) {
    console.error(error);
    subdivisionSelect.innerHTML = '<option value="">Error loading subdivisions</option>';
    return;
  }

  const names = collectSubdivisionNames(data);
  availableSubdivisionNames = names;
  if (forceFullLoad && isClassITable) {
    hasLoadedAllClassISubdivisions = true;
  }
  syncSubdivisionSearchMode(activeRailroadFilter);
  applySubdivisionSearchFilter();
}

if (typeof module !== "undefined") {
  module.exports = {
    collectSubdivisionNames,
    fetchAllSubdivisionRows,
    filterSubdivisionNames,
    isClassISubdivisionSearchEnabled,
    getInstallContext,
    getInstallUiState,
    getInstallHelpContent,
    getPersistedInstallBannerDismissed,
    persistInstallBannerDismissed,
    shouldDeferClassISubdivisionLoad,
    SUBDIVISION_PAGE_SIZE,
    getMapTableConfig,
    getMapFilterColor,
    getLeafletGlobal,
    getTrackGeometry,
    googleMapsDirectionsUrl,
    formatMapMarkerInfoText,
    shouldAutoShowMarkerInfo,
    getFilteredRowsForMap,
    hasActiveEntitlement,
    getIsPro,
    checkEntitlements,
    initRevenueCat,
    isPurchasesSdkAvailable,
    RC_ENTITLEMENT,
    RC_PRODUCT_ID,
    isValidEmail,
    getStoredUserEmail,
    persistUserEmail,
    requestStripeCheckoutUrl,
    requestStripeBillingPortalUrl,
    refreshBillingCapabilityUi,
  };
  // isRevenueCatConfigured is mutated after initRevenueCat() runs (once
  // RC.configure() completes), so expose it as a live getter rather than a
  // plain property snapshot taken at module.exports assignment time.
  Object.defineProperty(module.exports, "isRevenueCatConfigured", {
    get: () => isRevenueCatConfigured,
    enumerable: true,
  });
}

subdivisionSearch.addEventListener("input", async () => {
  if (!isClassISubdivisionSearchEnabled()) {
    applySubdivisionSearchFilter();
    return;
  }
  if (hasLoadedAllClassISubdivisions) {
    applySubdivisionSearchFilter();
    return;
  }

  const prefix = subdivisionSearch.value.trim();
  const searchToken = ++latestSubdivisionSearchToken;

  if (!prefix) {
    availableSubdivisionNames = [];
    subdivisionResults.hidden = true;
    subdivisionResults.innerHTML = "";
    clearLookupUI();
    return;
  }

  const cacheKey = `${activeRailroadFilter.key}:${prefix.toLowerCase()}`;
  if (subdivisionPrefixCache.has(cacheKey)) {
    availableSubdivisionNames = subdivisionPrefixCache.get(cacheKey) || [];
    applySubdivisionSearchFilter();
    return;
  }

  subdivisionResults.innerHTML = "<p class=\"subdivision-results-label\">Searching…</p>";
  subdivisionResults.hidden = false;

  const snapshotFilter = activeRailroadFilter;
  const buildQuery = () => {
    const tableName = CLASS_I_TABLES.has(snapshotFilter.key) ? snapshotFilter.key : "railroads";
    let query = supabaseClient
      .schema("public")
      .from(tableName)
      .select("subdivision")
      .not("subdivision", "is", null)
      .ilike("subdivision", `${prefix}%`);

    if (tableName === "railroads") {
      const railroad = CLASS_I_RAILROADS.find((r) => r.key === snapshotFilter.key);
      if (railroad && railroad.aliases.length > 0) {
        query = query.in("railroad_abreviation", railroad.aliases);
      }
    }

    return query;
  };

  const { data, error } = await fetchAllSubdivisionRows(buildQuery);

  if (searchToken !== latestSubdivisionSearchToken || activeRailroadFilter !== snapshotFilter) {
    return;
  }

  if (error) {
    console.error(error);
    subdivisionResults.innerHTML = "<p class=\"subdivision-results-label\">Error loading subdivisions.</p>";
    return;
  }

  const names = collectSubdivisionNames(data);
  subdivisionPrefixCache.set(cacheKey, names);
  availableSubdivisionNames = names;
  applySubdivisionSearchFilter();
});

loadAllSubdivisionsBtn.addEventListener("click", async () => {
  loadAllSubdivisionsBtn.disabled = true;
  subdivisionSelect.innerHTML = '<option value="">Loading subdivisions…</option>';
  subdivisionSelect.disabled = true;
  try {
    await loadSubdivisionDropdown({ forceFullLoad: true });
  } finally {
    if (!loadAllSubdivisionsBtn.hidden) {
      loadAllSubdivisionsBtn.disabled = false;
    }
  }
});

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
        <th>Linear Footage</th>
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
        <td>${escHtml(row.planned_footage ?? "")}</td>
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
      crossingsTableBody.innerHTML = '<tr><td colspan="10" class="empty-state-cell">No crossings found for this filter.</td></tr>';
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

// ---------------------------------------------------------------------------
// Railroad preference flow
// ---------------------------------------------------------------------------

const FAVORITE_RAILROAD_KEY = "favoriteRailroad";

function getSavedFavoriteRailroad() {
  try {
    const raw = localStorage.getItem(FAVORITE_RAILROAD_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function saveFavoriteRailroad(filter) {
  try {
    localStorage.setItem(FAVORITE_RAILROAD_KEY, JSON.stringify(filter));
  } catch (e) {
    console.warn("Could not save favorite railroad:", e);
  }
}

function clearFavoriteRailroad() {
  try {
    localStorage.removeItem(FAVORITE_RAILROAD_KEY);
  } catch (e) {
    // ignore
  }
}

function showPicker() {
  document.getElementById("railroadPicker").style.display = "block";
  document.getElementById("appContent").style.display = "none";
}

function showApp() {
  document.getElementById("railroadPicker").style.display = "none";
  document.getElementById("appContent").style.display = "block";
}

function buildPickerButtons() {
  const container = document.getElementById("pickerButtons");
  container.innerHTML = "";

  CLASS_I_RAILROADS.forEach((railroad) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "picker-btn";
    btn.textContent = railroad.label;
    btn.addEventListener("click", () => {
      const filter = { type: "classI", key: railroad.key, label: railroad.label };
      saveFavoriteRailroad(filter);
      applyFavoriteAndShowApp(filter);
    });
    container.appendChild(btn);
  });

  // "All Railroads" option for power users
  const allBtn = document.createElement("button");
  allBtn.type = "button";
  allBtn.className = "picker-btn picker-btn-all";
  allBtn.textContent = "Browse All Railroads";
  allBtn.addEventListener("click", () => {
    const filter = { type: "all", key: "all", label: "All Railroads" };
    saveFavoriteRailroad(filter);
    applyFavoriteAndShowApp(filter);
  });
  container.appendChild(allBtn);
}

async function applyFavoriteAndShowApp(filter) {
  showApp();
  await Promise.all([loadAllRailroadNames(), loadRailroads()]);
  await setRailroadFilter(filter);
}

function updateActiveRailroadLabel(filter) {
  const label = document.getElementById("activeRailroadLabel");
  if (label) {
    let text;
    if (filter.type === "all") {
      text = "All Class 2 Railroads";
    } else if (filter.type === "other") {
      text = filter.label || "Other Railroad";
    } else {
      text = filter.label || "All Railroads";
    }
    label.textContent = text;
  }
}

function updateRailroadBrowserPanel(filter) {
  const panel = document.getElementById("railroadBrowserPanel");
  if (!panel) return;
  // Show the browser panel when no specific Class I railroad is locked in,
  // so users can still pick / change the Class II railroad from the dropdown.
  panel.hidden = filter.type === "classI";
}

// ============================================================
// MAP FEATURE
// ============================================================

/** Color per Class I railroad key for consistent visual identity across the map. */
const CLASS_I_COLORS = {
  bnsf: "#f97316",
  cn:   "#16a34a",
  cpkc: "#dc2626",
  csx:  "#2563eb",
  ns:   "#7c3aed",
  up:   "#ca8a04",
};
const DEFAULT_MAP_COLOR = "#6b7280";
const MAP_MODAL_RENDER_DELAY_MS = 40;
const MAP_PAGE_SIZE = 1000;
const MAP_AUTO_INFO_ZOOM = 14;
const MAP_AUTO_INFO_MAX_MARKERS = 40;

let mapLeafletInstance = null;
let mapMarkersLayer = null;
let mapTrackLayer = null;
let activeMapFilter = { type: "all", key: "all", label: "All Railroads" };
let activeMapSubdivision = "";
let allMapRows = [];
let allMapSubdivisionNames = [];
let mapClassIINames = [];

/**
 * Returns the subset of crossing rows whose subdivision matches the given
 * subdivision string (case-insensitive, trimmed).  When subdivision is empty
 * or not provided all rows are returned unchanged.
 *
 * @param {object[]} rows
 * @param {string} subdivision
 * @returns {object[]}
 */
function getFilteredRowsForMap(rows, subdivision) {
  const sub = (subdivision || "").trim().toLowerCase();
  if (!sub) return rows;
  return rows.filter(
    (row) => (firstDefinedPropertyValue(row, MAP_SUBDIVISION_KEYS) || "").trim().toLowerCase() === sub
  );
}

function shouldAutoShowMarkerInfo(zoom, isInView, shownCount, maxCount = MAP_AUTO_INFO_MAX_MARKERS) {
  return zoom >= MAP_AUTO_INFO_ZOOM && isInView && shownCount < maxCount;
}

function openMapDirections(lat, lon) {
  if (!hasLatLon(lat, lon)) return;
  const url = googleMapsDirectionsUrl(lat, lon);
  if (typeof window !== "undefined" && window && typeof window.open === "function") {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

function refreshMapMarkerPresentation() {
  if (!mapLeafletInstance || !mapMarkersLayer) return;
  const zoom = mapLeafletInstance.getZoom();
  const markerRadius = zoom >= 10 ? 4 : zoom >= 7 ? 5 : 6;
  const bounds = typeof mapLeafletInstance.getBounds === "function" ? mapLeafletInstance.getBounds() : null;
  let shownCount = 0;

  mapMarkersLayer.eachLayer((layer) => {
    if (typeof layer.setRadius === "function") {
      layer.setRadius(markerRadius);
    }
    if (typeof layer.getLatLng !== "function") return;

    const latlng = layer.getLatLng();
    const isInView = !bounds || typeof bounds.contains !== "function" ? true : bounds.contains(latlng);
    if (shouldAutoShowMarkerInfo(zoom, isInView, shownCount)) {
      if (typeof layer.openTooltip === "function") layer.openTooltip();
      shownCount += 1;
    } else if (typeof layer.closeTooltip === "function") {
      layer.closeTooltip();
    }
  });
}

/**
 * Track-geometry stub.
 *
 * Returns a GeoJSON FeatureCollection of railroad track lines for the given
 * railroad key, or null when data is not yet available.
 *
 * Expected data shape when implemented:
 * {
 *   type: "FeatureCollection",
 *   features: [
 *     {
 *       type: "Feature",
 *       geometry: { type: "LineString", coordinates: [[lon, lat], …] },
 *       properties: { railroad_key: "up", subdivision: "Sunset" }
 *     }
 *   ]
 * }
 *
 * To wire up real data, replace this stub with a fetch() call to a hosted
 * GeoJSON file or an API endpoint that returns the shape above.
 *
 * @param {string} _railroadKey – e.g. "up", "bnsf", or a Class II name
 * @returns {object|null}
 */
function getTrackGeometry(_railroadKey) {
  // Sample track GeoJSON for testing and demonstration.
  // In production, replace with a real data source (API or hosted GeoJSON).
  const sampleTracks = {
    type: "FeatureCollection",
    features: [
      // NOTE: Three sample segments removed — they were not real railroad lines:
      // 1. A fake east-to-west line through Oklahoma (approx. 35°N, -102 to -94°W).
      // 2. A fake north-south line from central Texas into Oklahoma (-97°W, 30–35°N).
      // 3. A fake Austin/San Antonio ↔ El Paso corridor (Sunset Sub label, -106 to -97°W along ~30°N).
    ],
  };
  return sampleTracks;
}

/**
 * Returns the Supabase table name and optional row-level filter for a map filter.
 * Exported for unit testing.
 *
 * @param {{ type: string, key: string }} filter
 * @returns {{ tableName: string, aliasFilter: string[]|null, nameFilter?: string }}
 */
function getMapTableConfig(filter) {
  if (filter.type === "classI" && CLASS_I_TABLES.has(filter.key)) {
    return { tableName: filter.key, aliasFilter: null };
  }
  if (filter.type === "classI") {
    const railroad = CLASS_I_RAILROADS.find((r) => r.key === filter.key);
    return { tableName: "railroads", aliasFilter: railroad ? railroad.aliases : [] };
  }
  if (filter.type === "other") {
    return { tableName: "railroads", aliasFilter: null, nameFilter: filter.key };
  }
  return { tableName: "railroads", aliasFilter: null };
}

/**
 * Returns the highlight color for a map filter.
 * Exported for unit testing.
 *
 * @param {{ type: string, key: string }} filter
 * @returns {string} CSS color string
 */
function getMapFilterColor(filter) {
  if (filter.type === "classI") return CLASS_I_COLORS[filter.key] || DEFAULT_MAP_COLOR;
  return DEFAULT_MAP_COLOR;
}

function getLeafletGlobal() {
  if (typeof window !== "undefined" && window && window.L) return window.L;
  if (typeof L !== "undefined") return L;
  return null;
}

/**
 * Fetches all map crossing rows in pages.
 *
 * @param {() => any} buildQuery Returns a fresh Supabase select query builder.
 * @param {number} pageSize
 * @returns {Promise<{ data: object[]|null, error: any }>}
 */
async function fetchAllMapCrossingRows(buildQuery, pageSize = MAP_PAGE_SIZE) {
  const allRows = [];
  let from = 0;

  while (true) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) return { data: null, error };

    const rows = data || [];
    allRows.push(...rows);
    if (rows.length < pageSize) return { data: allRows, error: null };

    from += pageSize;
  }
}

async function loadMapCrossings(filter) {
  const mapStatusEl = document.getElementById("mapStatus");
  if (mapStatusEl) mapStatusEl.textContent = "Loading crossings…";

  const { tableName, aliasFilter, nameFilter } = getMapTableConfig(filter);

  const buildQuery = () => {
    let query = supabaseClient
      .schema("public")
      .from(tableName)
      .select("dot_number, railroad, subdivision, latitude, longitude, mile_post_num")
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      // Use a deterministic multi-column ordering for stable pagination.
      .order("dot_number", { ascending: true })
      .order("railroad", { ascending: true })
      .order("subdivision", { ascending: true })
      .order("mile_post_num", { ascending: true });

    if (aliasFilter && aliasFilter.length > 0) {
      query = query.in("railroad_abreviation", aliasFilter);
    } else if (nameFilter) {
      query = query.ilike("railroad", nameFilter);
    }
    return query;
  };

  const { data, error } = await fetchAllMapCrossingRows(buildQuery);

  if (mapStatusEl) {
    mapStatusEl.textContent = error
      ? `Error: ${error.message}`
      : `${(data || []).length} crossing(s) shown · zoom to ${MAP_AUTO_INFO_ZOOM}+ for quick info · click a marker for directions`;
  }

  return error ? [] : (data || []);
}

function renderMapMarkers(rows, filter) {
  if (!mapLeafletInstance) return;
  const leaflet = getLeafletGlobal();
  if (!leaflet) {
    console.error("[map] Leaflet global (window.L) is missing while rendering map markers.");
    return;
  }

  if (mapMarkersLayer) {
    mapMarkersLayer.clearLayers();
  } else {
    mapMarkersLayer = leaflet.layerGroup().addTo(mapLeafletInstance);
  }

  if (mapTrackLayer) {
    mapTrackLayer.clearLayers();
  } else {
    mapTrackLayer = leaflet.layerGroup().addTo(mapLeafletInstance);
  }

  const color = getMapFilterColor(filter);
  const validRows = (rows || []).filter((r) => hasLatLon(r.latitude, r.longitude));

  validRows.forEach((row) => {
    const lat = parseFloat(row.latitude);
    const lon = parseFloat(row.longitude);
    if (isNaN(lat) || isNaN(lon)) return;
    const popupMilepost = escHtml(firstDefinedPropertyValue(row, MAP_MILEPOST_KEYS));
    const popupSubdivision = escHtml(firstDefinedPropertyValue(row, MAP_SUBDIVISION_KEYS));

    const marker = leaflet.circleMarker([lat, lon], {
      radius: 6,
      fillColor: color,
      color: "#fff",
      weight: 1,
      opacity: 1,
      fillOpacity: 0.85,
    });

    marker.bindPopup(
      `<strong>${escHtml(row.railroad || "Unknown")}</strong><br>` +
      `DOT #: ${escHtml(row.dot_number || "N/A")}<br>` +
      `Milepost: ${popupMilepost}<br>` +
      `Subdivision: ${popupSubdivision}`
    );
    marker.bindTooltip(formatMapMarkerInfoText(row, true), { direction: "top", opacity: 0.9, offset: [0, -8] });
    marker.on("click", () => openMapDirections(lat, lon));
    mapMarkersLayer.addLayer(marker);
  });

  // Track geometry layer — renders automatically once getTrackGeometry() returns data.
  const trackGeoJson = getTrackGeometry(filter.key);
  if (trackGeoJson) {
    const zoom = mapLeafletInstance.getZoom();
    const trackWeight = zoom >= 10 ? 3 : zoom >= 7 ? 5 : 7;
    const trackStyle = { color, weight: trackWeight, opacity: 0.8 };
    mapTrackLayer.addLayer(leaflet.geoJSON(trackGeoJson, { style: () => trackStyle }));
  }

  // Fit view to visible markers
  if (validRows.length > 0) {
    try {
      const latlngs = mapMarkersLayer.getLayers()
        .filter((l) => typeof l.getLatLng === "function")
        .map((l) => l.getLatLng());
      if (latlngs.length > 0) {
        mapLeafletInstance.fitBounds(leaflet.latLngBounds(latlngs), { padding: [30, 30], maxZoom: 10 });
      }
    } catch (e) {
      // fitBounds errors are non-fatal
    }
  }

  // Update legend
  const legendEl = document.getElementById("mapLegend");
  const legendLabel = document.getElementById("mapLegendLabel");
  const legendDot = document.getElementById("mapLegendDot");
  if (legendEl) {
    if (filter.type === "all") {
      legendEl.style.display = "none";
    } else {
      legendEl.style.display = "inline-flex";
      if (legendLabel) legendLabel.textContent = filter.label;
      if (legendDot) legendDot.style.background = color;
    }
  }
}

function updateClearSubdivisionBtn() {
  const btn = document.getElementById("mapResetFilterBtn");
  if (!btn) return;
  const hasActive = !!(activeMapSubdivision || (document.getElementById("mapSubdivisionSearch") || {}).value);
  btn.disabled = !hasActive;
}

function clearMapSubdivision() {
  activeMapSubdivision = "";
  const mapSubEl = document.getElementById("mapSubdivisionSearch");
  if (mapSubEl) mapSubEl.value = "";
  const mapSubResultsEl = document.getElementById("mapSubdivisionResults");
  if (mapSubResultsEl) {
    mapSubResultsEl.hidden = true;
    mapSubResultsEl.innerHTML = "";
  }
  updateClearSubdivisionBtn();
  renderMapMarkers(getFilteredRowsForMap(allMapRows, activeMapSubdivision), activeMapFilter);
}

async function applyMapFilter(filter, keepSubdivision = false) {
  activeMapFilter = filter;
  if (!keepSubdivision) {
    activeMapSubdivision = "";
    const mapSubEl = document.getElementById("mapSubdivisionSearch");
    if (mapSubEl) mapSubEl.value = "";
    const mapSubResultsEl = document.getElementById("mapSubdivisionResults");
    if (mapSubResultsEl) {
      mapSubResultsEl.hidden = true;
      mapSubResultsEl.innerHTML = "";
    }
    updateClearSubdivisionBtn();
  }
  buildMapClassITabs();
  allMapRows = await loadMapCrossings(filter);
  allMapSubdivisionNames = Array.from(collectSubdivisionNames(allMapRows));
  renderMapMarkers(getFilteredRowsForMap(allMapRows, activeMapSubdivision), filter);
}

function renderMapSubdivisionAutocomplete(names) {
  const resultsEl = document.getElementById("mapSubdivisionResults");
  const searchEl = document.getElementById("mapSubdivisionSearch");
  if (!resultsEl || !searchEl) return;
  resultsEl.innerHTML = "";
  if (!names.length) {
    if (searchEl.value.trim()) {
      const msg = document.createElement("div");
      msg.className = "subdivision-results-label";
      msg.textContent = "No subdivisions found.";
      resultsEl.appendChild(msg);
      resultsEl.hidden = false;
    } else {
      resultsEl.hidden = true;
    }
    return;
  }
  const fragment = document.createDocumentFragment();
  names.forEach((name) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "subdivision-result-btn";
    btn.textContent = name;
    btn.addEventListener("click", () => {
      searchEl.value = name;
      resultsEl.hidden = true;
      resultsEl.innerHTML = "";
      activeMapSubdivision = name;
      updateClearSubdivisionBtn();
      renderMapMarkers(getFilteredRowsForMap(allMapRows, activeMapSubdivision), activeMapFilter);
    });
    fragment.appendChild(btn);
  });
  resultsEl.appendChild(fragment);
  resultsEl.hidden = false;
}

function buildMapClassITabs() {
  const container = document.getElementById("mapClassITabs");
  if (!container) return;
  container.innerHTML = "";

  const allBtn = document.createElement("button");
  allBtn.type = "button";
  allBtn.className = "map-filter-btn" + (activeMapFilter.type === "all" ? " active" : "");
  allBtn.textContent = "All";
  allBtn.onclick = () => applyMapFilter({ type: "all", key: "all", label: "All Railroads" });
  container.appendChild(allBtn);

  CLASS_I_RAILROADS.forEach((rr) => {
    const btn = document.createElement("button");
    btn.type = "button";
    const isActive = activeMapFilter.type === "classI" && activeMapFilter.key === rr.key;
    btn.className = "map-filter-btn" + (isActive ? " active" : "");
    btn.textContent = rr.label;
    btn.style.setProperty("--rr-color", CLASS_I_COLORS[rr.key] || DEFAULT_MAP_COLOR);
    btn.onclick = () => applyMapFilter({ type: "classI", key: rr.key, label: rr.label });
    container.appendChild(btn);
  });
}

async function loadMapClassIINames() {
  if (mapClassIINames.length > 0) return;

  const { data, error } = await supabaseClient
    .schema("public")
    .from("railroads_names")
    .select("railroads")
    .order("railroads", { ascending: true });

  if (error || !data) return;

  mapClassIINames = data
    .map((row) => String(row.railroads || "").trim())
    .filter((name) => name.length > 0 && !CLASS_I_ALIAS_TO_KEY.has(name.toUpperCase()));

  const sel = document.getElementById("mapClassIISelect");
  if (!sel) return;
  sel.innerHTML = '<option value="">Select Class II railroad…</option>';
  mapClassIINames.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    sel.appendChild(opt);
  });
}

function initMapLeaflet() {
  const container = document.getElementById("mapContainer");
  if (!container || mapLeafletInstance) return;
  const leaflet = getLeafletGlobal();
  if (!leaflet) {
    console.error("[map] Leaflet library unavailable: expected window.L before opening map modal.");
    return;
  }

  try {
    mapLeafletInstance = leaflet.map("mapContainer").setView([39.5, -98.35], 4);
  } catch (error) {
    if (mapLeafletInstance && typeof mapLeafletInstance.remove === "function") {
      mapLeafletInstance.remove();
    }
    mapLeafletInstance = null;
    console.error("[map] Failed to initialize Leaflet map instance.", error);
    return;
  }

  try {
    const tileLayer = leaflet.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    });
    if (!tileLayer || typeof tileLayer.addTo !== "function") {
      if (mapLeafletInstance && typeof mapLeafletInstance.remove === "function") {
        mapLeafletInstance.remove();
      }
      mapLeafletInstance = null;
      console.error("[map] Tile layer initialization failed: tileLayer was not created.");
      return;
    }
    tileLayer.addTo(mapLeafletInstance);
    mapLeafletInstance.on("zoomend moveend", refreshMapMarkerPresentation);
  } catch (error) {
    if (mapLeafletInstance && typeof mapLeafletInstance.remove === "function") {
      mapLeafletInstance.remove();
    }
    mapLeafletInstance = null;
    console.error("[map] Tile layer initialization failed.", error);
  }
}

function openMapModal() {
  const modal = document.getElementById("mapModal");
  if (!modal) return;
  modal.style.display = "flex";
  document.body.classList.add("map-modal-open");

  // Pre-select the filter that matches the current main-app selection.
  const initialFilter =
    activeRailroadFilter.type !== "all"
      ? activeRailroadFilter
      : { type: "all", key: "all", label: "All Railroads" };
  activeMapFilter = initialFilter;

  buildMapClassITabs();
  loadMapClassIINames();

  // Defer Leaflet initialization by one animation frame so the browser
  // can perform a layout pass and the container has measured dimensions
  // before L.map() reads them.
  requestAnimationFrame(() => {
    initMapLeaflet();
    if (!mapLeafletInstance) return;
    // Wait one frame plus a short delay to ensure modal dimensions settle
    // before invalidating size and fitting marker bounds.
    requestAnimationFrame(() => {
      setTimeout(() => {
        if (!mapLeafletInstance) return;
        mapLeafletInstance.invalidateSize();
        loadMapCrossings(initialFilter).then((rows) => {
          allMapRows = rows;
          allMapSubdivisionNames = Array.from(collectSubdivisionNames(allMapRows));
          renderMapMarkers(getFilteredRowsForMap(allMapRows, activeMapSubdivision), initialFilter);
        });
      }, MAP_MODAL_RENDER_DELAY_MS);
    });
  });
}

function closeMapModal() {
  const modal = document.getElementById("mapModal");
  if (!modal) return;
  modal.style.display = "none";
  document.body.classList.remove("map-modal-open");
}

if (typeof module === "undefined") {
  registerServiceWorker();
  isInstallBannerDismissed = getPersistedInstallBannerDismissed();
  refreshInstallUi();

  if (installAppBtn) {
    installAppBtn.addEventListener("click", () => {
      handleInstallButtonClick().catch((error) => {
        console.error("Install prompt failed:", error);
        setInstallStatus("Install could not be started. Please use the manual install steps.");
        refreshInstallUi();
      });
    });
  }

  if (installHelpBtn) {
    installHelpBtn.addEventListener("click", () => {
      toggleInstallHelp();
    });
  }

  if (installDismissBtn) {
    installDismissBtn.addEventListener("click", dismissInstallBanner);
  }

  if (typeof window !== "undefined" && window && typeof window.addEventListener === "function") {
    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      deferredInstallPromptEvent = event;
      setInstallStatus("");
      refreshInstallUi();
    });

    window.addEventListener("appinstalled", () => {
      deferredInstallPromptEvent = null;
      isInstallHelpExpanded = false;
      setInstallStatus("App installed successfully.");
      refreshInstallUi();
    });
  }

  incrementVisitCount();
  initRevenueCat();

  // Wire up "Change Railroad" button
  const changeRailroadBtn = document.getElementById("changeRailroadBtn");
  if (changeRailroadBtn) {
    changeRailroadBtn.addEventListener("click", () => {
      clearFavoriteRailroad();
      showPicker();
    });
  }

  buildPickerButtons();

  // Wire up Map button and modal events
  const mapBtnEl = document.getElementById("mapBtn");
  if (mapBtnEl) mapBtnEl.addEventListener("click", openMapModal);

  const mapCloseBtnEl = document.getElementById("mapCloseBtn");
  if (mapCloseBtnEl) mapCloseBtnEl.addEventListener("click", closeMapModal);

  const mapResetFilterBtnEl = document.getElementById("mapResetFilterBtn");
  if (mapResetFilterBtnEl) {
    mapResetFilterBtnEl.addEventListener("click", () => {
      clearMapSubdivision();
    });
  }

  const mapClassIISelectEl = document.getElementById("mapClassIISelect");
  if (mapClassIISelectEl) {
    mapClassIISelectEl.addEventListener("change", () => {
      const name = mapClassIISelectEl.value;
      if (name) applyMapFilter({ type: "other", key: name, label: name });
    });
  }

  const mapSubdivisionSearchEl = document.getElementById("mapSubdivisionSearch");
  if (mapSubdivisionSearchEl) {
    mapSubdivisionSearchEl.addEventListener("input", () => {
      const query = mapSubdivisionSearchEl.value.trim().toLowerCase();
      const filtered = allMapSubdivisionNames.filter((n) => n.toLowerCase().includes(query));
      renderMapSubdivisionAutocomplete(filtered);
      updateClearSubdivisionBtn();
    });
    mapSubdivisionSearchEl.addEventListener("blur", () => {
      // Delay hiding so click events on autocomplete items can fire first.
      setTimeout(() => {
        const resultsEl = document.getElementById("mapSubdivisionResults");
        if (resultsEl) {
          resultsEl.hidden = true;
          resultsEl.innerHTML = "";
        }
      }, 200);
    });
    mapSubdivisionSearchEl.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        clearMapSubdivision();
      }
    });
  }

  const mapModalEl = document.getElementById("mapModal");
  if (mapModalEl) {
    mapModalEl.addEventListener("click", (e) => {
      if (e.target === mapModalEl) closeMapModal();
    });
  }

  // Escape key closes the map modal regardless of which element has focus.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.getElementById("mapModal")?.style.display !== "none") {
      closeMapModal();
    }
  });

  const savedFilter = getSavedFavoriteRailroad();
  if (savedFilter) {
    // Returning user — go straight to their railroad
    applyFavoriteAndShowApp(savedFilter);
  } else {
    // First visit — show picker
    showPicker();
  }
}
