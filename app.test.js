const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function loadAppExports(options = {}) {
  const source = fs.readFileSync("/home/runner/work/railroad-crossings-app/railroad-crossings-app/app.js", "utf8");
  const sandbox = {
    console: { log() {}, error() {}, warn() {} },
    module: { exports: {} },
    exports: {},
    supabase: { createClient: () => ({ rpc: async () => ({}), schema: () => ({ from: () => ({}) }) }) },
    Purchases: options.purchases || {
      configure() {},
      getSharedInstance: () => ({ getCustomerInfo: async () => ({ entitlements: { active: {} } }) }),
    },
    localStorage: { getItem: () => "test-user", setItem() {} },
    crypto: { randomUUID: () => "uuid" },
    document: {
      getElementById: () => ({
        addEventListener() {},
        style: {},
        textContent: "",
        innerHTML: "",
        disabled: false,
        hidden: false,
        value: "",
        appendChild() {},
        remove() {},
        classList: { add() {}, remove() {}, toggle() {} },
        querySelectorAll: () => [],
      }),
      createElement: () => ({
        value: "",
        textContent: "",
        appendChild() {},
        classList: { add() {}, remove() {} },
      }),
    },
    window: options.window || {},
    setTimeout,
    clearTimeout,
  };
  if (options.globalLeaflet) sandbox.L = options.globalLeaflet;

  vm.runInNewContext(source, sandbox, { filename: "app.js" });
  return sandbox.module.exports;
}

function toPlainValue(value) {
  return JSON.parse(JSON.stringify(value));
}

async function run() {
  const {
    collectSubdivisionNames,
    fetchAllSubdivisionRows,
    filterSubdivisionNames,
    getInstallContext,
    getInstallUiState,
    getInstallHelpContent,
    getPersistedInstallBannerDismissed,
    persistInstallBannerDismissed,
    isClassISubdivisionSearchEnabled,
    shouldDeferClassISubdivisionLoad,
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
    RC_ENTITLEMENT,
  } = loadAppExports();

  const names = collectSubdivisionNames([
    { subdivision: "  Alpha " },
    { subdivision: "beta" },
    { subdivision: "alpha" },
    { subdivision: null },
    { subdivision: "Beta " },
    { subdivision: "Gamma" },
  ]);
  assert.deepEqual(Array.from(names), ["Alpha", "beta", "Gamma"]);

  assert.equal(isClassISubdivisionSearchEnabled({ type: "classI", key: "up" }), true);
  assert.equal(isClassISubdivisionSearchEnabled({ type: "classI", key: "bnsf" }), true);
  assert.equal(isClassISubdivisionSearchEnabled({ type: "classI", key: "not-a-class-i" }), false);
  assert.equal(isClassISubdivisionSearchEnabled({ type: "other", key: "Regional Railroad" }), false);

  assert.deepEqual(
    Array.from(filterSubdivisionNames(["Alpha", "Beta", "Gamma", "Delta"], "be")),
    ["Beta"]
  );
  assert.deepEqual(
    Array.from(filterSubdivisionNames(["Alpha", "Beta", "Gamma", "Delta"], "mm")),
    []
  );
  assert.deepEqual(
    Array.from(filterSubdivisionNames(["Alpha", "Beta"], "")),
    ["Alpha", "Beta"]
  );

  assert.equal(
    shouldDeferClassISubdivisionLoad({ type: "classI", key: "up" }, false),
    true
  );
  assert.equal(
    shouldDeferClassISubdivisionLoad({ type: "classI", key: "up" }, true),
    false
  );

  assert.deepEqual(
    toPlainValue(getInstallContext({
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
      window: { matchMedia: () => ({ matches: false }) },
      navigator: { standalone: false },
    })),
    { isIOS: true, isStandalone: false }
  );
  assert.deepEqual(
    toPlainValue(getInstallContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      window: { matchMedia: () => ({ matches: true }) },
      navigator: { standalone: false },
    })),
    { isIOS: false, isStandalone: true }
  );
  assert.deepEqual(
    toPlainValue(getInstallContext({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)",
      maxTouchPoints: 5,
      window: { matchMedia: () => ({ matches: false }) },
      navigator: { standalone: false },
    })),
    { isIOS: true, isStandalone: false }
  );
  assert.deepEqual(
    toPlainValue(getInstallUiState({ hasDeferredPrompt: true, isIOS: false, isStandalone: false })),
    {
      showSection: true,
      showInstallButton: true,
      showDismissButton: true,
      showHelpButton: true,
      primaryMessage: "Install this app for faster access: use your browser menu and tap ‘Add to Home Screen’.",
      helpButtonLabel: "How",
      fallbackMessage: "",
      autoExpandHelp: false,
    }
  );
  assert.deepEqual(
    toPlainValue(getInstallUiState({ hasDeferredPrompt: false, isIOS: true, isStandalone: false })),
    {
      showSection: true,
      showInstallButton: true,
      showDismissButton: true,
      showHelpButton: true,
      primaryMessage: "Install this app for faster access: use your browser menu and tap ‘Add to Home Screen’.",
      helpButtonLabel: "How",
      fallbackMessage: "Don’t see Install? Open the browser menu and choose ‘Add to Home Screen’. On iPhone, use Safari → Share → Add to Home Screen.",
      autoExpandHelp: true,
    }
  );
  assert.deepEqual(
    toPlainValue(getInstallUiState({ hasDeferredPrompt: false, isIOS: false, isStandalone: false, isDismissed: true })),
    {
      showSection: false,
      showInstallButton: false,
      showDismissButton: false,
      showHelpButton: false,
      primaryMessage: "",
      helpButtonLabel: "How",
      fallbackMessage: "",
      autoExpandHelp: false,
    }
  );
  assert.deepEqual(
    toPlainValue(getInstallHelpContent({ isIOS: false })),
    {
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
      defaultSectionIndex: 0,
    }
  );
  assert.deepEqual(
    toPlainValue(getInstallHelpContent({ isIOS: true })),
    {
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
      defaultSectionIndex: 1,
    }
  );
  const fakeStore = {
    value: "0",
    getItem() { return this.value; },
    setItem(_key, next) { this.value = next; },
  };
  assert.equal(getPersistedInstallBannerDismissed(fakeStore), false);
  persistInstallBannerDismissed(true, fakeStore);
  assert.equal(getPersistedInstallBannerDismissed(fakeStore), true);
  persistInstallBannerDismissed(false, fakeStore);
  assert.equal(getPersistedInstallBannerDismissed(fakeStore), false);

  const pageSize = 12;
  const total = 29;
  const rows = Array.from({ length: total }, (_, index) => ({ subdivision: `Subdivision ${String(index + 1).padStart(2, "0")}` }));
  const calls = [];

  const result = await fetchAllSubdivisionRows(() => ({
    order() {
      return this;
    },
    async range(from, to) {
      calls.push([from, to]);
      return { data: rows.slice(from, to + 1), error: null };
    },
  }), pageSize);

  assert.equal(result.error, null);
  assert.equal(result.data.length, total);
  assert.deepEqual(calls, [
    [0, 11],
    [12, 23],
    [24, 35],
  ]);

  console.log("app.test.js passed");

  // ── Map feature tests ────────────────────────────────────────────────────

  // getMapTableConfig – Class I railroad with its own dedicated table
  let cfg = getMapTableConfig({ type: "classI", key: "up" });
  assert.equal(cfg.tableName, "up");
  assert.equal(cfg.aliasFilter, null);
  assert.equal(Object.keys(cfg).includes("nameFilter"), false);

  cfg = getMapTableConfig({ type: "classI", key: "bnsf" });
  assert.equal(cfg.tableName, "bnsf");
  assert.equal(cfg.aliasFilter, null);

  // getMapTableConfig – Class II / other railroad
  cfg = getMapTableConfig({ type: "other", key: "Regional Railroad" });
  assert.equal(cfg.tableName, "railroads");
  assert.equal(cfg.aliasFilter, null);
  assert.equal(cfg.nameFilter, "Regional Railroad");

  // getMapTableConfig – "all" filter falls back to shared railroads table
  cfg = getMapTableConfig({ type: "all", key: "all" });
  assert.equal(cfg.tableName, "railroads");
  assert.equal(cfg.aliasFilter, null);

  // getMapFilterColor – Class I railroads return their designated colors
  assert.equal(getMapFilterColor({ type: "classI", key: "up" }), "#ca8a04");
  assert.equal(getMapFilterColor({ type: "classI", key: "bnsf" }), "#f97316");
  assert.equal(getMapFilterColor({ type: "classI", key: "ns" }), "#7c3aed");

  // getMapFilterColor – unknown Class I key falls back to DEFAULT_MAP_COLOR
  assert.equal(getMapFilterColor({ type: "classI", key: "unknown" }), "#6b7280");

  // getMapFilterColor – "all" and "other" types return DEFAULT_MAP_COLOR
  assert.equal(getMapFilterColor({ type: "all", key: "all" }), "#6b7280");
  assert.equal(getMapFilterColor({ type: "other", key: "Regional Railroad" }), "#6b7280");

  // getLeafletGlobal – detects missing Leaflet and both window/global fallbacks
  assert.equal(getLeafletGlobal(), null);
  const mockLeaflet = { map() {} };
  const { getLeafletGlobal: getLeafletFromWindow } = loadAppExports({ window: { L: mockLeaflet } });
  assert.equal(getLeafletFromWindow(), mockLeaflet);
  const { getLeafletGlobal: getLeafletFromGlobal } = loadAppExports({ globalLeaflet: mockLeaflet });
  assert.equal(getLeafletFromGlobal(), mockLeaflet);

  // getTrackGeometry – returns an empty FeatureCollection (all sample segments removed)
  const trackGeo = getTrackGeometry("up");
  assert.equal(trackGeo.type, "FeatureCollection");
  assert.ok(Array.isArray(trackGeo.features));
  assert.equal(trackGeo.features.length, 0);

  // getTrackGeometry – result is the same regardless of key (no sample features remain)
  const trackGeo2 = getTrackGeometry("bnsf");
  assert.equal(trackGeo2.type, "FeatureCollection");
  assert.equal(trackGeo2.features.length, 0);

  // map directions URL builder
  assert.equal(
    googleMapsDirectionsUrl(41.1234, -87.9876),
    "https://www.google.com/maps/dir/?api=1&destination=41.1234,-87.9876"
  );

  // auto-info visibility helper
  assert.equal(shouldAutoShowMarkerInfo(14, true, 0), true);
  assert.equal(shouldAutoShowMarkerInfo(13, true, 0), false);
  assert.equal(shouldAutoShowMarkerInfo(14, false, 0), false);
  assert.equal(shouldAutoShowMarkerInfo(14, true, 40), false);

  // map tooltip helper
  assert.equal(
    formatMapMarkerInfoText({ mile_post_num: 22.8, subdivision: "Sunset" }),
    "Milepost 22.8 · Sunset"
  );
  assert.equal(
    formatMapMarkerInfoText({ milepost: "14.2", SUBDIVISION: "Mopac" }),
    "Milepost 14.2 · Mopac"
  );
  assert.equal(
    formatMapMarkerInfoText({}),
    "Milepost N/A · N/A"
  );

  console.log("map feature tests passed");

  // ── getFilteredRowsForMap ────────────────────────────────────────────────

  const mapRows = [
    { subdivision: "Sunset", latitude: 1, longitude: 1 },
    { subdivision: "  sunset  ", latitude: 2, longitude: 2 },
    { subdivision: "Mopac", latitude: 3, longitude: 3 },
    { subdivision: null, latitude: 4, longitude: 4 },
  ];

  // Empty subdivision → all rows returned
  assert.deepEqual(getFilteredRowsForMap(mapRows, ""), mapRows);
  assert.deepEqual(getFilteredRowsForMap(mapRows, null), mapRows);
  assert.deepEqual(getFilteredRowsForMap(mapRows, undefined), mapRows);

  // Case-insensitive match, trims whitespace from both sides
  const sunsetRows = getFilteredRowsForMap(mapRows, "sunset");
  assert.equal(sunsetRows.length, 2);
  assert.ok(sunsetRows.every((r) => (r.subdivision || "").trim().toLowerCase() === "sunset"));

  // Match is exact (not partial)
  assert.equal(getFilteredRowsForMap(mapRows, "sun").length, 0);

  // No match → empty array
  assert.equal(getFilteredRowsForMap(mapRows, "Unknown Sub").length, 0);

  console.log("getFilteredRowsForMap tests passed");

  // ── RevenueCat monetization flow ─────────────────────────────────────────

  // Default free state: bypass removed, isPro starts false without any
  // entitlement check having run yet.
  assert.equal(getIsPro(), false);
  const appSource = fs.readFileSync("/home/runner/work/railroad-crossings-app/railroad-crossings-app/app.js", "utf8");
  assert.equal(appSource.includes("TEMP: testing branch paywall bypass"), false);
  assert.equal(appSource.includes("let isPro = true;"), false);

  // hasActiveEntitlement gracefully handles missing objects/keys.
  assert.equal(hasActiveEntitlement(undefined), false);
  assert.equal(hasActiveEntitlement(null), false);
  assert.equal(hasActiveEntitlement({}), false);
  assert.equal(hasActiveEntitlement({ entitlements: {} }), false);
  assert.equal(hasActiveEntitlement({ entitlements: { active: {} } }), false);
  assert.equal(
    hasActiveEntitlement({ entitlements: { active: { [RC_ENTITLEMENT]: {} } } }),
    true
  );

  // No active entitlement → checkEntitlements keeps the user locked/free.
  await checkEntitlements();
  assert.equal(getIsPro(), false);

  // Active entitlement → checkEntitlements unlocks Pro.
  const {
    getIsPro: getIsProWithEntitlement,
    checkEntitlements: checkEntitlementsWithEntitlement,
  } = loadAppExports({
    purchases: {
      configure() {},
      getSharedInstance: () => ({
        getCustomerInfo: async () => ({
          entitlements: { active: { [RC_ENTITLEMENT]: { isActive: true } } },
        }),
      }),
    },
  });
  await checkEntitlementsWithEntitlement();
  assert.equal(getIsProWithEntitlement(), true);

  // Errors while checking entitlements preserve the locked/free state.
  const { getIsPro: getIsProAfterError, checkEntitlements: checkEntitlementsWithError } =
    loadAppExports({
      purchases: {
        configure() {},
        getSharedInstance: () => ({
          getCustomerInfo: async () => {
            throw new Error("network error");
          },
        }),
      },
    });
  await checkEntitlementsWithError();
  assert.equal(getIsProAfterError(), false);

  // initRevenueCat always calls checkEntitlements and updates isPro, even if
  // Purchases.configure throws.
  const { getIsPro: getIsProAfterInit, initRevenueCat: initRevenueCatWithEntitlement } =
    loadAppExports({
      purchases: {
        configure() {
          throw new Error("configure failed");
        },
        getSharedInstance: () => ({
          getCustomerInfo: async () => ({
            entitlements: { active: { [RC_ENTITLEMENT]: { isActive: true } } },
          }),
        }),
      },
    });
  await initRevenueCatWithEntitlement();
  assert.equal(getIsProAfterInit(), true);

  console.log("RevenueCat monetization tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
