#!/usr/bin/env node
/* Captures App Store assets by driving the live web app in a headless browser:
   - 10 iPhone 6.9" screenshots (1290x2796 PNG)
   - 3 raw app-preview videos (430x932 MP4; the workflow upscales to 1290x2796)
   Run: node scripts/store-assets.js   (BASE_URL env var optional) */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE_URL = process.env.BASE_URL || "https://railroad-crossings-app.vercel.app/";
const OUT = process.env.OUT_DIR || path.join(__dirname, "..", "store-assets");
const PHONE = { width: 430, height: 932 };
const GEO = { latitude: 41.8781, longitude: -87.6298 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SHOTS = path.join(OUT, "screenshots");
const RAW = path.join(OUT, "videos-raw");
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(RAW, { recursive: true });

async function newContext(browser, recordVideo) {
  const context = await browser.newContext({
    viewport: PHONE,
    deviceScaleFactor: recordVideo ? 1 : 3,
    locale: "en-US",
    ...(recordVideo ? { recordVideo: { size: PHONE } } : {})
  });
  await context.grantPermissions(["geolocation"], { origin: new URL(BASE_URL).origin });
  await context.setGeolocation({ ...GEO, accuracy: 30 });
  return context;
}

async function loadApp(page) {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.addStyleTag({ content: "#installSection{display:none !important}" });
  await sleep(3000);
}

async function openFirstSubdivision(page) {
  await page.click("#loadAllSubdivisionsBtn", { timeout: 10000 }).catch(() => {});
  await sleep(4000);
  await page
    .locator("#subdivisionResults button, #subdivisionResults li, #subdivisionResults a")
    .first()
    .click({ timeout: 5000 })
    .catch(() => {});
  await sleep(3000);
}

async function firstDotFromTable(page) {
  try {
    const row = await page.locator("#crossingsTableBody tr").first().textContent({ timeout: 4000 });
    return ((row || "").match(/\b\d{5,8}\b/) || [])[0] || null;
  } catch {
    return null;
  }
}

async function captureShots(browser) {
  const context = await newContext(browser, false);
  const page = await context.newPage();
  const steps = [
    ["01-home-hero", async () => {
      await loadApp(page);
    }],
    ["02-railroad-browser", async () => {
      await loadApp(page);
      await page.click("#changeRailroadBtn", { timeout: 10000 }).catch(() => {});
      await sleep(1500);
    }],
    ["03-classI-bnsf", async () => {
      await loadApp(page);
      await page.click("#changeRailroadBtn", { timeout: 10000 }).catch(() => {});
      await sleep(800);
      await page.locator("#classITabs button:has-text('BNSF')").first().click({ timeout: 5000 }).catch(() => {});
      await sleep(2000);
    }],
    ["04-subdivision-browser", async () => {
      await loadApp(page);
      await page.click("#loadAllSubdivisionsBtn", { timeout: 10000 }).catch(() => {});
      await sleep(4000);
    }],
    ["05-crossings-table", async () => {
      await loadApp(page);
      await openFirstSubdivision(page);
    }],
    ["06-dot-search", async () => {
      await loadApp(page);
      await openFirstSubdivision(page);
      const dot = await firstDotFromTable(page);
      if (dot) {
        await page.fill("#dotSearch", dot, { timeout: 5000 }).catch(() => {});
        await sleep(400);
        await page.click("#dotSearchBtn", { timeout: 5000 }).catch(() => {});
        await sleep(3500);
      }
    }],
    ["07-nearest-crossing", async () => {
      await loadApp(page);
      await page.click("#nearestBtn", { timeout: 10000 }).catch(() => {});
      await sleep(7000);
    }],
    ["08-crossings-map", async () => {
      await loadApp(page);
      await page.click("#mapBtn", { timeout: 10000 }).catch(() => {});
      await sleep(7000);
    }],
    ["09-map-zoomed", async () => {
      await loadApp(page);
      await page.click("#mapBtn", { timeout: 10000 }).catch(() => {});
      await sleep(6000);
      await page.click(".leaflet-control-zoom-in", { timeout: 5000 }).catch(() => {});
      await sleep(1500);
    }],
    ["10-shortline-picker", async () => {
      await loadApp(page);
      await page.click("#changeRailroadBtn", { timeout: 10000 }).catch(() => {});
      await sleep(800);
      await page.selectOption("#otherRailroadsSelect", { index: 1 }, { timeout: 5000 }).catch(() => {});
      await sleep(2000);
    }]
  ];
  const done = [];
  for (const [name, step] of steps) {
    try {
      await step();
      await page.screenshot({ path: path.join(SHOTS, name + ".png") });
      done.push(name);
      console.log("captured", name);
    } catch (e) {
      console.log("skip", name, "-", e.message);
    }
  }
  await context.close();
  return done;
}

const FLOWS = [
  ["preview-1-browse-railroads", async (page) => {
    await loadApp(page);
    await sleep(2000);
    await page.click("#changeRailroadBtn").catch(() => {});
    await sleep(1800);
    await page.locator("#classITabs button:has-text('BNSF')").first().click().catch(() => {});
    await sleep(2000);
    await page.click("#changeRailroadBtn").catch(() => {});
    await sleep(1500);
    await page.locator("#classITabs button:has-text('UP')").first().click().catch(() => {});
    await sleep(2500);
  }],
  ["preview-2-nearest-crossing", async (page) => {
    await loadApp(page);
    await sleep(2000);
    await page.click("#nearestBtn").catch(() => {});
    await sleep(8000);
    await page.locator("#nearestModal").evaluate((el) => (el.scrollTop = el.scrollHeight)).catch(() => {});
    await sleep(2000);
  }],
  ["preview-3-dot-lookup", async (page) => {
    await loadApp(page);
    await sleep(1500);
    await openFirstSubdivision(page);
    const dot = await firstDotFromTable(page);
    if (dot) {
      await page.click("#dotSearch").catch(() => {});
      await sleep(500);
      await page.type("#dotSearch", dot, { delay: 260 }).catch(() => {});
      await sleep(600);
      await page.click("#dotSearchBtn").catch(() => {});
      await sleep(4500);
    } else {
      await sleep(6000);
    }
  }]
];

async function recordFlows(browser) {
  for (const [name, flow] of FLOWS) {
    const context = await newContext(browser, true);
    const page = await context.newPage();
    try {
      await flow(page);
      await sleep(1000);
    } catch (e) {
      console.log("flow error", name, "-", e.message);
    }
    const video = page.video();
    await context.close();
    const file = await video.path();
    fs.renameSync(file, path.join(RAW, name + ".mp4"));
    console.log("recorded", name);
  }
}

(async () => {
  const browser = await chromium.launch();
  const shots = await captureShots(browser);
  console.log("screenshots done:", shots.length);
  await recordFlows(browser);
  await browser.close();
  console.log("DONE");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});