// POST /api/create-portal-session
//
// Creates a Stripe Billing Portal session for the Stripe customer matching
// the signed-in user's email, and returns its redirect URL.
"use strict";

const { getStripeClient, getAppUrl, isValidEmail } = require("./_stripe");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "A valid email address is required to manage your subscription." });
  }

  let stripe;
  let appUrl;
  try {
    stripe = getStripeClient();
    appUrl = getAppUrl();
  } catch (error) {
    console.error("Stripe configuration error:", error.message);
    return res.status(500).json({ error: "Billing portal is not configured. Please try again later." });
  }

  try {
    const customers = await stripe.customers.list({ email, limit: 1 });
    const customer = customers.data[0];

    if (!customer) {
      return res.status(404).json({ error: "No subscription was found for this email address." });
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: `${appUrl}/?billing=return`,
    });

    return res.status(200).json({ url: portalSession.url });
  } catch (error) {
    console.error("Error creating Stripe billing portal session:", error);
    return res.status(500).json({ error: "Unable to open the billing portal. Please try again." });
  }
};
