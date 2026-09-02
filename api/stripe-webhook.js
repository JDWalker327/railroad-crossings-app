// POST /api/stripe-webhook
//
// Verifies and logs Stripe subscription lifecycle events. RevenueCat is the
// source of truth for entitlement state in this app (RevenueCat has its own
// Stripe integration configured directly in the RevenueCat dashboard), so
// this handler does not need to flip any local "isPro" flag. It exists so
// the app has a place to add local diagnostics/support tooling (e.g.
// logging failed payments) without depending on RevenueCat's webhook.
"use strict";

const { getStripeClient } = require("./_stripe");

// Disable Vercel's default JSON body parsing so we can verify the Stripe
// signature against the exact raw request body.
module.exports.config = { api: { bodyParser: false } };

async function readRawBody(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

const HANDLED_EVENT_TYPES = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
]);

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not configured.");
    return res.status(500).json({ error: "Webhook is not configured." });
  }

  let stripe;
  try {
    stripe = getStripeClient();
  } catch (error) {
    console.error("Stripe configuration error:", error.message);
    return res.status(500).json({ error: "Webhook is not configured." });
  }

  const signature = req.headers["stripe-signature"];
  let event;
  try {
    const rawBody = await readRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    console.error("Stripe webhook signature verification failed:", error.message);
    return res.status(400).json({ error: "Invalid signature." });
  }

  if (HANDLED_EVENT_TYPES.has(event.type)) {
    console.log(`Stripe webhook received: ${event.type}`, { id: event.data?.object?.id });
  } else {
    console.log(`Stripe webhook received (unhandled type): ${event.type}`);
  }

  return res.status(200).json({ received: true });
};
