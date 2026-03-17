/**
 * Google Analytics ecommerce tracking for signup flow
 * Tracks purchase events when users complete Outseta registration
 */

export function generateTransactionId() {
  // Generate date in YYYYMMDD format
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const dateStr = `${year}${month}${day}`;
  
  // Generate 8-character random hex string
  const uid = Array.from({ length: 8 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");
  
  return `ANV-${dateStr}-${uid}`;
}

export function pushGAPurchaseEvent(config, state) {
  if (!config.gaConfig || !config.gaConfig.trackPurchase) return;
  if (!state.plan || !state.plan.annualRate) return;

  window.dataLayer = window.dataLayer || [];

  const plan = state.plan;
  const transactionId = generateTransactionId();
  const affiliation = config.gaConfig.companyName || "Anvisninger.dk";
  const itemCategory = config.gaConfig.itemCategory || "Abonnement";

  const itemId = plan.planUid || "PLAN_UID_IKKE_FUNDET";
  const itemName = plan.name || "PLAN_NAVN_IKKE_FUNDET";
  const price = Math.round(plan.annualRate);
  const currency = "DKK";

  window.dataLayer.push({
    event: "purchase",
    ecommerce: {
      transaction_id: transactionId,
      affiliation: affiliation,
      value: price,
      currency: currency,
      items: [
        {
          item_id: itemId,
          item_name: itemName,
          affiliation: affiliation,
          item_category: itemCategory,
          item_brand: affiliation,
          price: price,
          quantity: 1,
        },
      ],
    },
  });
}

export function setupOutsetaCompletionTracking(config, state) {
  if (!config.gaConfig || !config.gaConfig.trackPurchase) return;
  if (!window.Outseta || typeof window.Outseta.on !== "function") return;

  // Listen for signup event from Outseta API
  // Fires after registration has completed
  window.Outseta.on("signup", (account) => {
    pushGAPurchaseEvent(config, state);
  });
}
