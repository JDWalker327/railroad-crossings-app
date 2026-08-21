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
    Purchases: { configure() {}, getSharedInstance: () => ({ getCustomerInfo: async () => ({ entitlements: { active: {} } }) }) },
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

async function run() {
  const {
    collectSubdivisionNames,
    fetchAllSubdivisionRows,
    filterSubdivisionNames,
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
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
