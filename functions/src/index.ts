import { initializeApp } from "firebase-admin/app";

initializeApp();

export { estimateFood } from "./estimateFood.js";
export { importDietPlan } from "./importDietPlan.js";
export { sendReminders } from "./sendReminders.js";
