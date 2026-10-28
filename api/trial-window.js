// POST /api/trial-window
//
// Server-side source of truth for the 14-day free trial window.
//
// localStorage is only the client's offline fallback. This endpoint keeps
// the authoritative start date in two places:
//   1. A signed HttpOnly cookie on the device (TRIAL_SIGNING_SECRET). It
//      survives localStorage eviction (e.g. iOS Safari purges
//      script-writable storage for sites unused for 7 days), so a
//      cleared/evicted storage no longer restarts the window.
//   2. A RevenueCat subscriber attribute, keyed by the user's email, once
//      they have entered it at the paywall (requires the project secret key
//      from the RevenueCat dashboard as REVENUECAT_SECRET_API_KEY). Clearing
//      all site data no longer grants a new window once the same email is
//      entered again.
//
// Both legs degrade gracefully: without TRIALPE_SIGNING_SECRET nothing is
// enforced (the client keeps its local stamp, exactly the old behavior);
// without the RevenueCat key only the cookie leg applies.
//
// The client mirrors the server's date into localStorage so the existing
// isTrialActive() logic and offline usage keep working unchanged.
"use strict";

const crypto = require("crypto");

const TRIAL_LENGTH_MS = 14 * 24 * 60 * 60 * 1000;
const COOKIE_NAME = "rw_trial_start";
const COOKIE_MAX_AGE_S = 2 * 365 * 24 * 60 * 60; // 2 years
const RC_ATTRIBUTE = "trial_window_start";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email) {
  return typeof email === "string" && EMAIL_PATTERN.test(email.trim());
}

function getSigningSecret() {
  // Prefer the dedicated signing secret; fall back to the Stripe secret key
  // (already a server-only value) for projects that have it configured.
  const secret = process.env.TRIAL_SIGNING_SECRET || process.env.STRIPE_SECRET_KEY;
  if (!secret || secret.length < 16) {
    throw new Error("TRIAL_SIGNING_SECRET is not configured.");
  }
  return secret;
}

function signValue(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

function parseTrialCookie(cookieHeader) {
  if (typeof cookieHeader !== "string") return null;
  const match = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(COOKIE_NAME + "="));
  if (!match) return null;
  const raw = decodeURIComponent(match.slice(COOKIE_NAME.length + 1));
  const dot = raw.lastIndexOf(".");
  if (dot === -1) return null;
  const value = raw.slice(0, dot);
  const signature = raw.slice(dot + 1);
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  return { value, time, signature };
}

function verifyTrialCookie(cookieHeader, secret) {
  const entry = parseTrialCookie(cookieHeader);
  if (!entry) return null;
  const expected = signValue(entry.value, secret);
  const a = Buffer.from(entry.signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return entry.time;
}

function buildTrialCookie(startTimeMs, secret) {
  const value = new Date(startTimeMs).toISOString();
  const signed = `${value}.${signValue(value, secret)}`;
  return `${COOKIE_NAME}=${encodeURIComponent(signed)}; Path=/; Max-Age=${COOKIE_MAX_AGE_S}; HttpOnly; Secure; SameSite=Lax`;
}

// ── RevenueCat ledger (email leg) ──────────────────────────────────────

function rcRequest(path, init) {
  const apiKey = process.env.REVENUECAT_SECRET_API_KEY;
  if (!apiKey) return null;
  return fetch(`https://api.revenuecat.com/v1/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Platform": "web",
      ...(init.headers || {}),
    },
  });
}

// Returns the earliest recorded trial start for this email from the
// RevenueCat subscriber attributes, or null when nothing is recorded.
async function lookupEmailLedger(email) {
  const res = await rcRequest(`subscribers/${encodeURIComponent(email)}`, { method: "GET" });
  if (!res || res.status === 404) return null; // never seen / no key
  if (!res.ok) throw new Error(`RevenueCat subscriber lookup failed (${res.status})`);
  const payload = await res.json();
  const attributes = (payload && payload.subscriber && payload.subscriber.attributes) || {};
  const raw = attributes[RC_ATTRIBUTE] && attributes[RC_ATTRIBUTE].value;
  const time = raw ? Date.parse(raw) : NaN;
  return Number.isFinite(time) ? time : null;
}

async function recordEmailLedger(email, startTimeMs) {
  const res = await rcRequest(`subscribers/${encodeURIComponent(email)}/attributes`, {
    method: "POST",
    body: JSON.stringify({ attributes: { [RC_ATTRIBUTE]: { value: new Date(startTimeMs).toISOString() } } }),
  });
  if (!res || !res.ok) throw new Error(`RevenueCat attribute write failed (${res && res.status})`);
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  let secret;
  try {
    secret = getSigningSecret();
  } catch (error) {
    // Nothing is enforced until the signing secret exists; the client keeps
    // its local stamp (the pre-existing behavior).
    console.error(error.message);
    return res.status(503).json({ error: "Trial window enforcement is not configured." });
  }

  const body = (typeof req.body === "object" && req.body) || {};
  const email = isValidEmail(body.email) ? body.email.trim().toLowerCase() : "";
  const now = Date.now();

  try {
    // Device leg.
    const cookieStart = verifyTrialCookie(req.headers.cookie, secret);

    // Email leg (only once the user has identified themselves).
    let ledgerStart = null;
    if (email && process.env.REVENUECAT_SECRET_API_KEY) {
      try {
        ledgerStart = await lookupEmailLedger(email);
      } catch (error) {
        // Degrade to the cookie leg rather than failing the request.
        console.warn("Trial ledger lookup failed:", error.message);
        ledgerStart = null;
      }
    }

    const candidates = [cookieStart, ledgerStart].filter((t) => t !== null);
    const finalStart = candidates.length > 0 ? Math.min(...candidates) : now;

    // First visit on this device: stamp the cookie with the authoritative
    // date (the email's earlier ledger date when one exists).
    if (cookieStart === null) {
      res.setHeader("Set-Cookie", buildTrialCookie(finalStart, secret));
    }

    // Keep the email ledger at the earliest known start.
    if (email && (ledgerStart === null || finalStart < ledgerStart)) {
      try {
        await recordEmailLedger(email, finalStart);
      } catch (error) {
        console.warn("Trial ledger write failed:", error.message);
      }
    }

    return res.status(200).json({
      trial_start: new Date(finalStart).toISOString(),
      trial_expires: new Date(finalStart + TRIAL_LENGTH_MS).toISOString(),
      active: finalStart + TRIAL_LENGTH_MS > now,
    });
  } catch (error) {
    console.error("Trial window error:", error.message);
    return res.status(500).json({ error: "Unable to check the trial window. Please try again later." });
  }
};
