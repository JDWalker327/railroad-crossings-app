// POST /api/trial-window
//
// Server-side source of truth for the 14-day free trial window.
//
// localStorage is only the client's offline fallback. This endpoint keeps
// the authoritative start date in two places:
//   1. A signed HttpOnly cookie on the device. It survives localStorage
//      eviction (e.g. iOS Safari purges script-writable storage for sites
//      unused for 7 days), so a cleared/evicted storage no longer restarts
//      the window.
//   2. The Stripe customer's metadata, keyed by email, once the user has
//      entered their email at the paywall. Clearing all site data no longer
//      grants a new window once the same email is entered again.
//
// The client mirrors the server's date into localStorage so the existing
// isTrialActive() logic and offline usage keep working unchanged.
"use strict";

const crypto = require("crypto");
const { getStripeClient, isValidEmail } = require("./_stripe");

const TRIAL_LENGTH_MS = 14 * 24 * 60 * 60 * 1000;
const COOKIE_NAME = "rw_trial_start";
const COOKIE_MAX_AGE_S = 2 * 365 * 24 * 60 * 60; // 2 years
const METADATA_KEY = "rw_trial_start";

function getSigningSecret() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }
  return secretKey;
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

// Returns the earliest recorded trial start for this email from the Stripe
// customer metadata ledger, or null when nothing is recorded. On any Stripe
// error the ledger leg degrades gracefully (the cookie leg still applies).
async function lookupEmailLedger(stripe, email) {
  const customers = await stripe.customers.list({ email, limit: 10 });
  let earliest = null;
  for (const customer of customers.data) {
    const raw = customer.metadata && customer.metadata[METADATA_KEY];
    const time = raw ? Date.parse(raw) : NaN;
    if (Number.isFinite(time) && (earliest === null || time < earliest)) {
      earliest = time;
    }
  }
  return earliest;
}

async function recordEmailLedger(stripe, email, startTimeMs) {
  const iso = new Date(startTimeMs).toISOString();
  const customers = await stripe.customers.list({ email, limit: 10 });
  const existing = customers.data.find((c) => c.metadata && c.metadata[METADATA_KEY]) || customers.data[0];
  if (existing) {
    await stripe.customers.update(existing.id, { metadata: { [METADATA_KEY]: iso } });
  } else {
    await stripe.customers.create({ email, metadata: { [METADATA_KEY]: iso } });
  }
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
    console.error(error.message);
    return res.status(500).json({ error: "Trial window is not configured. Please try again later." });
  }

  const body = (typeof req.body === "object" && req.body) || {};
  const email = isValidEmail(body.email) ? body.email.trim().toLowerCase() : "";
  const now = Date.now();

  try {
    // Device leg.
    const cookieStart = verifyTrialCookie(req.headers.cookie, secret);

    // Email leg (only once the user has identified themselves).
    let ledgerStart = null;
    let stripe = null;
    if (email) {
      try {
        stripe = getStripeClient();
        ledgerStart = await lookupEmailLedger(stripe, email);
      } catch (error) {
        // Degrade to the cookie leg rather than failing the request.
        console.warn("Stripe trial ledger lookup failed:", error.message);
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
        await recordEmailLedger(stripe, email, finalStart);
      } catch (error) {
        console.warn("Stripe trial ledger write failed:", error.message);
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
