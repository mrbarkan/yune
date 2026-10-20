import { initializeApp } from "firebase-admin/app";

initializeApp();

export { createCheckout, createPortal, getProPrices, stripeWebhook } from "./billing.js";
export { deleteAccount } from "./deleteAccount.js";
export { estimateFood } from "./estimateFood.js";
export { importDietPlan } from "./importDietPlan.js";
export { readHealthDoc, saveHealthDoc } from "./readHealthDoc.js";
export { sendReminders } from "./sendReminders.js";
