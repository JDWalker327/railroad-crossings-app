#!/usr/bin/env node
/* Assembles the Capacitor www/ folder from this repo's static web app,
   and writes the capacitor.config.json used for the iOS build. */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const WWW = path.join(ROOT, "www");

const FILES = ["index.html", "app.js", "style.css", "sw.js", "manifest.webmanifest", "privacy.html"];
const DIRS = ["icons", "images"];

fs.rmSync(WWW, { recursive: true, force: true });
fs.mkdirSync(WWW, { recursive: true });

for (const f of FILES) {
  if (fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(WWW, f));
}
for (const d of DIRS) {
  if (fs.existsSync(path.join(ROOT, d))) fs.cpSync(path.join(ROOT, d), path.join(WWW, d), { recursive: true });
}

fs.writeFileSync(
  path.join(ROOT, "capacitor.config.json"),
  JSON.stringify({ appId: "com.rail1.crossings", appName: "Railroad Crossings", webDir: "www" }, null, 2) + "\n"
);

console.log("www/ assembled:", fs.readdirSync(WWW).join(", "));
