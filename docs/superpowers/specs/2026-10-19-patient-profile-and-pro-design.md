# Patient health profile + Pro with Stripe — design

Date: 2026-10-19 · Project 1 of 4 in the "clinic relationship" roadmap

## Why

Yune is heading toward a patient–clinic relationship app for high-end nutrition clinics in Brazil (model: clinics
like Clínica Seven: doctors + nutritionists, metabolic diagnosis, in-person or remote follow-up). Before any clinic
feature exists, **the patient app has to stand on its own**: a person with no nutritionist should get real value from
a fuller health profile, and Pro has to be something people can actually buy. Everything built here is what a
nutritionist will see later (project 2), so the data is captured in the shape clinicians use.

Roadmap, in the order the user chose:
1. **This project:** patient health profile + working Pro upgrade (Stripe).
2. Clinic core: clinics, roles, invite code + consent, nutritionist panel, demo clinic.
3. Public LGPD / safety web page + policy drafts for a lawyer.
4. Later: doctors, minors with guardians, clinic billing, clinic self-signup.

## Goals

- A **Perfil** screen that gathers who the person is and how their body is changing: profile photo, measurements,
  body composition (bioimpedance), lab exams, evolution photos and a health questionnaire (anamnese).
- Bioimpedance and lab reports are read by AI from a photo/PDF, **confirmed by the person**, stored as numbers and
  charted over time, with the original file kept.
- **Pro is purchasable** by credit card through Stripe (monthly and annual), and the app reflects the subscription
  state live. The beta (`PRO_OPEN`) can be switched off cleanly.
- Tested: automated tests for rules and pure logic, and a manual run on the Firebase emulators with Stripe test mode.

## Non-goals (this project)

- Anything clinic-side: sharing, consent screens, roles, panel, access logs (project 2).
- Pix, boleto, Asaas, or any payment method other than card (user decision: "credit card only, for now").
- Nota fiscal (NFS-e) issuing — a business task outside the app (Stripe doesn't issue it).
- Account deletion / data export flows and the LGPD documents (project 3), and minors (project 4).
- Skinfolds, extra circumferences, handgrip, QFA, hunger/satiety, symptom log (research "nice-to-have"; later).

## Anti-goals (would be a failure even if it "works")

- **Yune interpreting health data.** The app shows the lab's own reference range and marks values outside it; it
  never says what a value means or suggests a diagnosis. Same for body composition: show numbers and change, not
  verdicts beyond the neutral "fat lost vs muscle lost" comparison.
- **Saving AI-read numbers without the person confirming them.**
- **Body photos leaking:** visible to anyone but the owner, saved to the gallery by the app, or shareable by link.
- **Hiding Pro features from free users.** Locked cards stay visible with a Pro badge, like Dieta today.
- **Breaking existing users:** profile fields and records already in `users/{uid}` keep working; nothing is migrated
  destructively.
- **Charging someone twice, or leaving a paying customer without Pro** because a webhook was missed.

## Decisions made with the user

| Topic | Decision |
|---|---|
| Free vs Pro | **Pro:** exams (labs) and bioimpedance, plus the existing diet plan. **Free:** profile photo, measurements, evolution photos, questionnaire. |
| Payment | **Stripe, credit card only.** Monthly + annual plans in BRL. Stripe Checkout (hosted page) + Customer Portal. |
| Trial | 7-day free trial on the first subscription (proposed by Claude, accepted). |
| Ending beta | Current users get **30 days of Pro** as a thank-you when `PRO_OPEN` goes off (proposed, accepted). |
| Locked features | Visible, with Pro badge and a "Conhecer o Pro" button (proposed, accepted). |
| Layout | Phone held upright (vertical). Profile mockup approved: header, Peso e medidas, Composição corporal, Exames, Fotos, Sua saúde. |
| Testing | Firebase emulators on the Mac, Stripe test mode; no real data or charges. |

## Calls made by Claude (user can override)

- **Navigation:** the gear in the tab bar becomes the person's avatar and opens **Perfil**. Ajustes moves inside
  Perfil (⚙ in the header). "Corpo" fields (name, sex, height, birth year) move from Ajustes into Perfil; goals,
  diet, notifications, Pro status and "Sair" stay in Ajustes.
- **Charts are hand-drawn SVG** in Yune's style (like `Dial.tsx`); no chart library.
- **Pro writes go through the server.** AI-read reports are saved by a callable function that checks Pro, the same
  way `importDietPlan` owns `diet_plans`. Free data (measurements, photos, questionnaire) is written by the app
  directly under Firestore rules, like meals.
- **`profile.weight_kg` stays** as "current weight" (used by `suggestedGoal` and activity kcal) and is updated
  whenever a newer measurement is saved.
- `useEntitlements` switches from a one-time `getDoc` to `onSnapshot`, so Pro turns on by itself when the webhook
  lands after checkout.

## The patient side

### Perfil screen (new tab, replaces the gear)

Top to bottom (see approved mockup `.superpowers/brainstorm/*/content/profile.html`):

1. **Header** — profile photo (tap to change), name, age (from birth year), height, goal (from the questionnaire).
2. **Peso e medidas** — latest weight and waist, change over the last weeks, sparkline. "+ medir" opens a sheet.
3. **Composição corporal** (Pro) — last reading: % fat, skeletal muscle, visceral fat, device + date; the line
   "Desde <primeira>: −X kg gordura · −Y kg músculo".
4. **Exames** (Pro) — latest report date and how many values are outside the lab's reference; "+ enviar".
5. **Fotos** — count of photo sessions, lock icon; opens the evolution view.
6. **Sua saúde** — questionnaire completion %; opens the form.

Each card opens a detail view with history and charts.

### Measurements (free)

- Fields: weight (kg), waist, hip, neck (cm) — weight required, the rest optional; date defaults to now.
- Computed in the app, never stored: BMI (needs height), waist/hip, waist/height.
- Detail view: line chart per measure, list of entries (edit/delete).
- Saving a measurement newer than any other updates `profile.weight_kg`.

### Body composition — bioimpedance (Pro)

- Person sends a photo or PDF of the report. A callable reads it and returns a **draft**; the person sees the
  "Confira os valores" screen (approved mockup), marked **"estimado por IA, confira"**, corrects anything, and saves.
- Values: weight, body fat %, fat mass (kg), skeletal muscle mass (kg) or lean mass, visceral fat level, basal
  metabolic rate (kcal), total body water (L), ECW/TBW, phase angle (°). Any can be "not reported".
- Always stored with **device** (free text, prefilled from the report) and **measured date**. Detail view warns
  that only readings from the same device are comparable and charts them per device.
- Highlight: fat mass change vs muscle change since the first reading **on the same device**.
- Manual entry (no file) is allowed — still Pro.
- The report's weight also becomes a measurement entry if none exists that day (builder's call how to dedupe).

### Lab exams (Pro)

- Person sends PDF or photos (multi-page photo = several images, up to a limit). Callable returns a draft list of
  results; person confirms/corrects/removes lines, sets collection date, saves.
- Each result: analyte code (from a fixed catalog, or "outro"), name as printed, value, unit, lab reference range
  (low/high and/or the printed text). The catalog maps common units to one canonical unit per analyte so charts
  don't mix ng/mL and nmol/L; unknown units are kept as printed and not charted together.
- Core catalog (from the research; chartable): glicemia de jejum, insulina, HbA1c, HOMA-IR (computed when both
  glucose and insulin exist: glicemia mg/dL × insulina µUI/mL ÷ 405), colesterol total, HDL, LDL, triglicérides,
  TSH, T4 livre, vitamina D (25-OH), B12, ferritina, ferro sérico, PCR-us, TGO, TGP, GGT, creatinina, ureia,
  ácido úrico, hemoglobina. Other analytes are kept as "outro" (shown in the report, not charted).
- Card shows how many values fall outside **the lab's** range. No interpretation text anywhere.
- Detail view: reports by date (tap → original file + values) and a chart per analyte with the reference band.

### Evolution photos (free)

- A session = date + up to three poses: frente, lado, costas. Camera or gallery.
- When taking a new pose, the previous photo of that pose is shown faintly as a guide.
- Compare view: pick two dates, side by side per pose, with weight/waist change between those dates when measured.
- Protection: Storage rules owner-only; images shown from `getBlob` object URLs (no public/download URLs); no
  "save" or "share" button; long-press/context menu disabled on the images. Copy says "Só você vê" and must not
  promise screenshots are blocked (a PWA can't block them).

### Health questionnaire — "Sua saúde" (free)

- Sections, fill in any order, auto-saves. Fields from the research (must-have set):
  - Objetivo (main goal / complaint).
  - Condições de saúde (checklist: diabetes, hipertensão, colesterol alto, tireoide, SOP, outras) + histórico familiar.
  - Medicamentos (free list) with a specific question about weight-loss drugs (GLP-1: Ozempic, Mounjaro, etc.).
  - Suplementos em uso (can reuse `supplements.json` names).
  - Alergias, intolerâncias, aversões, preferências.
  - Intestino: frequency + Bristol type (1–7, with the standard illustrations or descriptions).
  - Rotina: hours of sleep (prefilled from sleep log average if present), stress (1–5), physical activity, álcool, tabagismo.
  - Ciclo menstrual (shown when sex = f): regular?, contraceptive, menopause.
  - Histórico de peso: maior e menor peso adulto, dietas anteriores, cirurgias.
  - Rotina alimentar: meal times, where, who cooks.
- **Versions (Claude's call): one per day.** Auto-save updates that day's version in place; editing on a later day
  starts a new version copied from the latest. The form always opens the latest. A clinician (project 2) sees the
  questionnaire as it was on each day it changed. Completion % = answered sections / total.

## Pro and payment

### Gating

- `FEATURES` in `src/lib/pro.ts` becomes `{ diet: "pro", labs: "pro", body_comp: "pro" }`.
- Server functions that create Pro data call `isPro(uid)`.
- Free users see the Exames and Composição corporal cards with the Pro badge and a short benefit line; tapping opens
  the Pro sheet.
- **When Pro ends (user decision): history stays, read-only.** Someone who cancels, lapses or reaches the end of the
  beta still sees their saved lab reports, bioimpedance readings (with original files and charts) and diet plan;
  only new uploads, saves and edits are locked. This changes today's diet behaviour (`useDietPlan(dietAllowed)`
  hides the plan): the plan stays visible, read-only, and diet warnings/"Pela dieta" stay off without Pro.

### Export my data (free, user decision)

- Ajustes › "Exportar meus dados": the person downloads **all their data** as an **Excel sheet (.xlsx)** or a
  **PDF**. Available to everyone, Pro or not (it also covers LGPD portability later).
- Content: profile, meals (with items and nutrients), water, sleep, movement, measurements, body composition, lab
  results, questionnaire (latest + dates of versions), diet plan. Excel: one sheet per kind. PDF: a readable report.
- **Body photos are not included** (Claude's call, to keep the "never leaves the app" promise); original exam files
  are already openable from each report.
- Generated on the device or by a function — builder's call; no data goes to any third party for this.

### Pro sheet and status

- **Pro sheet** ("Conhecer o Pro"): what's included (Dieta, Exames, Composição corporal), the two prices read from
  Stripe, trial note when eligible, "Assinar" buttons. Opened from any locked card and from Ajustes.
- **Ajustes › Yune Pro**: one of "Pro até 19/11", "Teste grátis até …", "Cancelado — Pro até …",
  "Pagamento pendente", or the subscribe button; "Gerenciar assinatura" opens the Stripe Customer Portal.

### Flow

1. App calls `createCheckout({ plan: "monthly" | "annual" })` → server creates/reuses the Stripe Customer for the uid,
   creates a Checkout Session (mode subscription, card, BRL, pt-BR locale, 7-day trial if never used), returns the URL.
2. Person pays on Stripe's page and returns to the app (`success_url` / `cancel_url` on the app's origin).
3. Stripe calls `stripeWebhook` (signature verified). On subscription created/updated/deleted and invoice
   paid/failed, the server writes `entitlements/{uid}`: `pro` true while status is trialing/active/past_due,
   `until` = current period end, `source: "stripe"`, plus `status` and `cancel_at_period_end` for display.
   It also stores the Stripe ids server-side (new server-only doc, e.g. `billing/{uid}`).
4. `createPortal()` returns a Customer Portal URL for card change and cancel. Cancelling keeps Pro until period end.
- Prices are Stripe Prices with lookup keys (e.g. `yune_pro_monthly`, `yune_pro_annual`); amounts are set in the
  Stripe dashboard and read by a callable, so changing a price needs no code. Failed renewals use Stripe's retries.
- Webhook handling is idempotent (same event twice = same result) and always rebuilds the entitlement from the
  subscription's current state, not from deltas.
- Secrets via `defineSecret` like `ANTHROPIC_API_KEY`: Stripe secret key and webhook signing secret. Functions in
  `REGION`.

### Ending the beta

A one-off admin script grants every existing user 30 days of beta Pro, then `PRO_OPEN` is set to `false` in
**both** `src/lib/pro.ts` and `functions/src/pro.ts` in the same release. Not done until billing is verified in
test mode and the user says go.

**Beta + Stripe together (Claude's call):**
- The entitlement keeps the two sources apart (e.g. `beta_until` written by the script, Stripe fields written by the
  webhook) and `pro`/`until` are derived as **the later of the two**. The webhook never erases a beta grant and the
  script never touches Stripe fields.
- The beta **counts as the trial**: a person with beta days left who subscribes gets a Checkout trial that ends when
  the beta ends (first charge then, no lost days), and no extra 7 days. `trial_used` = has had a Stripe trial or a
  beta grant.

## Data (Firestore / Storage)

All dates ISO UTC strings, like the rest of the app. Collections under `users/{uid}` unless noted. Field names are
the builder's call; the shapes are:

| Where | What | Who writes |
|---|---|---|
| `users/{uid}` | add `photo_path` | app (rules extended) |
| `measurements` | `measured_at`, `weight_kg`, `waist_cm?`, `hip_cm?`, `neck_cm?`, `source` | app |
| `body_comp` | `measured_at`, `device`, the values above (nullable), `file_path?`, `ai` (was AI-read) | server callable |
| `lab_reports` | `collected_at`, `lab?`, `results[]`, `file_paths[]`, `ai` | server callable |
| `body_photos` | `taken_at`, `pose`, `path` (one doc per photo, grouped by session date) | app |
| `anamnesis` | dated versions of the questionnaire | app |
| `entitlements/{uid}` | add `status`, `cancel_at_period_end` | server only (unchanged rule) |
| `billing/{uid}` | Stripe customer/subscription ids, `trial_used` | server only (no client access) |

Storage: `profile-photos/{uid}/`, `body-photos/{uid}/` (images ≤ 5 MB), `health-docs/{uid}/` (PDF or images ≤ 10 MB);
owner-only read/delete, owner create, same patterns as `meal-photos` and `diet-plans`. Deleting a report or photo
deletes its file.

Rules validate shape and ranges for every app-written collection, like meals today. `body_comp` and `lab_reports`:
owner read/delete only; create/update by the server.

## AI (reading reports)

- One new callable (e.g. `readHealthDoc`, mode `body_comp` | `labs`), same conventions as `estimateFood` /
  `importDietPlan`: email-verified auth, Pro check, daily limit via `bumpUsage`, Claude Haiku (`claude-haiku-5-5`),
  structured output **without anyOf/null** (see commit d894b48 — "absent" = "" or 0, converted after), always
  returns an object (result or `{ error }`), pt-BR errors.
- Input: a Storage path the person just uploaded (PDF sent as a document block, images as image blocks).
- The prompt treats the document as data and ignores instructions inside it (like `importDietPlan`). The schema has
  no field for name, CPF or other identity, and none is stored. Redacting the file itself before sending it to the
  API is **out of scope here** and listed for project 3 (international-transfer / minimisation review).
- Returns a draft only; saving is a second call with the confirmed values (or a `save` mode), which validates
  ranges server-side and writes the doc.

## Testing

- Add Firebase Emulator Suite config (auth, firestore, storage, functions) to `firebase.json` and an `npm` script
  to start it with the app pointed at it (env flag in `src/lib/firebase.ts`).
- Add a test runner (Vitest) with:
  - **Rules tests** (`@firebase/rules-unit-testing`): owner-only access for every new collection and Storage path;
    client cannot write `body_comp`, `lab_reports`, `entitlements`, `billing`; shape validation rejects bad data.
  - **Pure logic:** BMI and ratios, HOMA-IR, unit normalisation, fat-vs-muscle delta (same device only),
    Stripe subscription → entitlement mapping (trialing, active, past_due, canceled, cancel_at_period_end).
  - **Webhook handler** with Stripe's signed test payloads (or the handler's pure core), including duplicates.
- **Seed script** for the emulators: one fake patient with ~8 weeks of meals/water/sleep/movement, measurements,
  two bioimpedance readings, one lab report, placeholder photos, a filled questionnaire. (Reused later for the demo
  clinic in project 2.)
- **Manual pass:** run the app on the emulators, Stripe CLI forwarding webhooks, test cards for success, decline,
  3-D Secure and a failed renewal; check every screen in light/dark and on a phone held upright.
- `npm run build` (includes `tsc --noEmit`) passes for app and functions.

## Constraints

- All UI text pt-BR. Styling in `src/styles.css` with the existing tokens and dark mode.
- Keep the existing "always return an object" convention for callables; region `southamerica-east1`.
- `PRO_OPEN` changes always in both files together (CLAUDE.md).
- Update CLAUDE.md with the new collections, Storage paths, functions and Stripe setup when done.

## Left to the builder

Exact field names; chart drawing; questionnaire widgets and copy; how to dedupe a bioimpedance weight with a
measurement; page limits for multi-image lab uploads; daily AI limit for `readHealthDoc`; Pro sheet copy; how the
app learns it's in emulator mode.

## Open items outside the code

- Prices for monthly and annual (set in Stripe dashboard).
- NFS-e for Stripe sales (accountant or an NFS-e service).
- Stripe account set up for the Brazilian company, with card enabled and the Customer Portal configured.
