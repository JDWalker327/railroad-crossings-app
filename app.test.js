const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function loadAppExports() {
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
        value: "",
        appendChild() {},
        classList: { add() {}, remove() {} },
      }),
      createElement: () => ({
        value: "",
        textContent: "",
        appendChild() {},
        classList: { add() {}, remove() {} },
      }),
    },
    window: {},
    setTimeout,
    clearTimeout,
  };

  vm.runInNewContext(source, sandbox, { filename: "app.js" });
  return sandbox.module.exports;
}

async function run() {
  const { collectSubdivisionNames, fetchAllSubdivisionRows } = loadAppExports();

  const names = collectSubdivisionNames([
    { subdivision: "  Alpha " },
    { subdivision: "beta" },
    { subdivision: "alpha" },
    { subdivision: null },
    { subdivision: "Beta " },
    { subdivision: "Gamma" },
  ]);
  assert.deepEqual(Array.from(names), ["Alpha", "beta", "Gamma"]);

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
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
