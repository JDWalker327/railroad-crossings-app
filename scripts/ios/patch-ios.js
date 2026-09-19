#!/usr/bin/env node
/* Patches the generated Capacitor iOS project:
   - app version + build number
   - iOS location permission strings
   - app icon (single-size 1024px, generated from icons/icon-512.png) */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = path.resolve(__dirname, "..", "..");
const APP_DIR = path.join(ROOT, "ios", "App", "App");
const APP_VERSION = process.env.APP_VERSION || "1.0.0";
const BUILD_NUMBER = process.env.BUILD_NUMBER || "1";
const DISPLAY_NAME = "Railroad Crossings";
const LOCATION_TEXT = "Railroad Crossings uses your location to find railroad crossings near you.";

function setPlistString(plist, key, value) {
  const tag = `<key>${key}</key>`;
  const i = plist.indexOf(tag);
  if (i === -1) {
    const end = plist.lastIndexOf("</dict>");
    return plist.slice(0, end) + `\t${tag}\n\t<string>${value}</string>\n` + plist.slice(end);
  }
  const start = plist.indexOf("<string>", i) + "<string>".length;
  const end = plist.indexOf("</string>", i);
  return plist.slice(0, start) + value + plist.slice(end);
}

async function main() {
  const plistPath = path.join(APP_DIR, "Info.plist");
  let plist = fs.readFileSync(plistPath, "utf8");
  plist = setPlistString(plist, "CFBundleDisplayName", DISPLAY_NAME);
  plist = setPlistString(plist, "CFBundleShortVersionString", APP_VERSION);
  plist = setPlistString(plist, "CFBundleVersion", BUILD_NUMBER);
  plist = setPlistString(plist, "NSLocationWhenInUseUsageDescription", LOCATION_TEXT);
  fs.writeFileSync(plistPath, plist);

  const appiconDir = path.join(APP_DIR, "Assets.xcassets", "AppIcon.appiconset");
  fs.mkdirSync(appiconDir, { recursive: true });
  fs.writeFileSync(
    path.join(appiconDir, "Contents.json"),
    JSON.stringify({
      images: [{ filename: "AppIcon-1024.png", idiom: "universal", platform: "ios", size: "1024x1024" }],
      info: { author: "xcode", version: 1 }
    }, null, 2)
  );
  await sharp(path.join(ROOT, "icons", "icon-512.png"))
    .resize(1024, 1024)
    .flatten({ background: "#000000" })
    .png()
    .toFile(path.join(appiconDir, "AppIcon-1024.png"));

  console.log(`iOS project patched: v${APP_VERSION} (${BUILD_NUMBER})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
