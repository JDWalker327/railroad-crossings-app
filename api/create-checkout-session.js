// POST /api/create-checkout-session
//
// Creates a Stripe Checkout Session for the $2.99/month subscription and
// returns its redirect URL. The signed-in user's email is used as both the
// Stripe customer email and the RevenueCat App User ID mapping, so RC's
// Stripe integration (configured in the RevenueCat dashboard) can match the
// subscription back to the same app user.
"use strict";

const { getStripeClient, getAppUrl, isValidEmail } = require("./_stripe");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "A valid email address is required to subscribe." });
  }

  const priceId = process.env.STRIPE_PRICE_MONTHLY;
  if (!priceId) {
    console.error("STRIPE_PRICE_MONTHLY is not configured.");
    return res.status(500).json({ error: "Subscription checkout is not configured. Please try again later." });
  }

  let stripe;
  let appUrl;
  try {
    stripe = getStripeClient();
    appUrl = getAppUrl();
  } catch (error) {
    console.error("Stripe configuration error:", error.message);
    return res.status(500).json({ error: "Subscription checkout is not configured. Please try again later." });
  }

  try {
    // Prefer a trial configured on the price itself. Only fall back to a
    // 14-day trial here if the price has no default trial configured, so we
    // never accidentally stack two trial periods.
    let trialPeriodDays;
    try {
      const price = await stripe.prices.retrieve(priceId);
      if (!price?.recurring?.trial_period_days) {
        trialPeriodDays = 14;
      }
    } catch (priceError) {
      console.warn("Unable to retrieve Stripe price for trial check; defaulting to 14-day trial:", priceError.message);
      trialPeriodDays = 14;
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: email,
      client_reference_id: email,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        metadata: { app_user_id: email },
        ...(trialPeriodDays ? { trial_period_days: trialPeriodDays } : {}),
      },
      metadata: { app_user_id: email },
      allow_promotion_codes: true,
      success_url: `${appUrl}/?checkout=success`,
      cancel_url: `${appUrl}/?checkout=cancel`,
    });

    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error("Error creating Stripe checkout session:", error);
    return res.status(500).json({ error: "Unable to start checkout. Please try again." });
  }
};
