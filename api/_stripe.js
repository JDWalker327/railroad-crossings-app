// Shared helpers for the Stripe serverless functions in this folder.
//
// These functions are Node.js/Vercel-style serverless functions (a plain
// `module.exports = async (req, res) => {...}` handler per file). GitHub
// Pages (where the static app is hosted) cannot execute server code, so
// this `/api` folder must be deployed to a Node-capable host such as
// Vercel. See the README "Stripe billing setup" section for details.
"use strict";

const Stripe = require("stripe");

let stripeClient = null;

/**
 * Lazily creates (and caches) the Stripe SDK client using the server-side
 * secret key. Never expose STRIPE_SECRET_KEY to client-side code.
 */
function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }
  if (!stripeClient) {
    stripeClient = new Stripe(secretKey, { apiVersion: "2024-06-20" });
  }
  return stripeClient;
}

/**
 * Returns the configured app base URL (no trailing slash) used to build
 * Stripe Checkout/Billing Portal success, cancel, and return URLs.
 */
function getAppUrl() {
  const appUrl = process.env.APP_URL;
  if (!appUrl) {
    throw new Error("APP_URL is not configured.");
  }
  return appUrl.replace(/\/+$/, "");
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email) {
  return typeof email === "string" && EMAIL_PATTERN.test(email.trim());
}

module.exports = { getStripeClient, getAppUrl, isValidEmail };
