// GET /.well-known/assetlinks.json (via vercel.json rewrite)
"use strict";

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const fingerprint = typeof process.env.PLAY_APP_SIGNING_SHA256 === "string"
    ? process.env.PLAY_APP_SIGNING_SHA256.trim()
    : "";

  if (!fingerprint) {
    return res.status(503).json({ error: "PLAY_APP_SIGNING_SHA256 is not configured." });
  }

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300");
  return res.status(200).json([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: "com.rail1.crossings",
        sha256_cert_fingerprints: [fingerprint]
      }
    }
  ]);
};
