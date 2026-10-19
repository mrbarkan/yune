# Patient health profile + Pro with Stripe — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Perfil screen (photo, measurements, body composition, labs, evolution photos, health questionnaire, data
export) and a Pro subscription people can buy by card through Stripe, all testable on the Firebase emulators.

**Architecture:** Same stack as today: React PWA writes free data straight to Firestore under rules; Pro data
(body composition, labs) is read by a Claude Haiku callable into a draft the person confirms, then saved by a second
callable that checks Pro. Stripe Checkout + Customer Portal; a webhook rebuilds `entitlements/{uid}` from Stripe's
current state, combined with a separate beta grant.

**Tech Stack:** React 19, Vite 8, TypeScript, Firebase 12 (Auth, Firestore, Storage, Functions v2 on Node 22),
`@anthropic-ai/sdk`, `stripe` (Node SDK v23), Vitest, `@firebase/rules-unit-testing`, `write-excel-file`, `jspdf` +
`jspdf-autotable`, Firebase Emulator Suite, Stripe CLI.

**Spec:** `docs/superpowers/specs/2026-10-19-patient-profile-and-pro-design.md` — read it before any task.

## Global Constraints

- All UI text pt-BR. Code comments pt-BR, short, like the existing files.
- Styling only in `src/styles.css` with the existing tokens (`--paper`, `--ink`, `--food`, `--move`, `--water`,
  `--sleep`, `--serif`, `--sans`…) and the existing `prefers-color-scheme: dark` block; new sections get a
  `/* ---------- nome ---------- */` header like the others. No CSS frameworks, no chart library.
- Dates stored as ISO UTC strings (`new Date().toISOString()`); rules validate them with `iso()`.
- Every callable returns an object: the result or `{ error: "<pt-BR message>" }`; checks `req.auth` and
  `email_verified`; `region: REGION` (`southamerica-east1`).
- Claude calls: model `claude-haiku-5-5`, structured output **without `anyOf`/`null`** ("absent" = `""` or `0`,
  converted after), document text treated as data.
- `PRO_OPEN` stays `true` in both `src/lib/pro.ts` and `functions/src/pro.ts` for the whole plan. Turning it off is
  a separate release the user approves (Task 15 only prepares it). The two always change together.
- Pro features: `diet`, `labs`, `body_comp`. Free: profile photo, measurements, photos, questionnaire, export.
- History stays readable without Pro; only new uploads/saves/edits of Pro data are locked.
- Body photos: owner-only, shown via `getBlob` object URLs, no download/share, excluded from export.
- Payment: Stripe, **card only**, BRL, monthly + annual Prices with lookup keys `yune_pro_monthly` and
  `yune_pro_annual`; 7-day trial on first subscription; beta counts as the trial.
- Commits in pt-BR, imperative, like `git log`; end every message with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `npm run build` (app) and `npm --prefix functions run build` must pass at the end of every task.

## Review Focus

1. **pt-BR numbers** — "71,8", "1.412", "0,36" typed by the person or returned as text by the AI must parse to
   71.8, 1412, 0.36 (Task 2 `parseDecimal` tests; used by every form and by the server parsers).
2. **Non-numeric lab values** — "<5", ">90", "Negativo", "Não reagente" must be kept as printed, never charted,
   never counted as out of range, never crash a chart (Task 2 `normalizeResult`/`outOfRange` tests).
3. **Mixed devices / missing fields in body composition** — a delta or chart must never compare an InBody reading
   with a Tanita one, or muscle_kg with lean_kg (Task 2 `bodyCompDelta` tests).
4. **Duplicate or out-of-order Stripe webhooks** — replaying an event, or an old `subscription.updated` arriving
   after `deleted`, must leave the entitlement matching Stripe's current subscription (Task 12 handler tests).
5. **Pro ending** — a canceled or expired person still sees saved labs/body comp/diet; saving new ones fails with a
   Pro message; a webhook never erases unexpired beta days (Task 4 `proStatus`, Task 9 save-guard, Task 12
   `deriveEntitlement` tests).

---

### Task 1: Test and emulator setup

**Files:**
- Modify: `firebase.json`, `.gitignore`, `package.json`, `functions/package.json`, `functions/tsconfig.json`,
  `src/lib/firebase.ts`
- Create: `.env.emulator`, `vitest.config.ts`, `functions/vitest.config.ts`, `tests/rules/smoke.test.ts`,
  `src/lib/time.test.ts`

**Interfaces:**
- Produces: `npm test` (unit, app), `npm run test:rules` (rules on emulators), `npm --prefix functions test`,
  `npm run emulators`, `npm run dev:emu`; emulator project id `demo-yune`; ports auth 9099, firestore **8085**
  (8080 is Vite), storage 9199, functions 5001, UI 4000.

- [ ] **Step 1:** Add dev deps: root `vitest@5`, `@firebase/rules-unit-testing@5`, `firebase-tools@15`; functions
  `vitest@5`, `stripe@23`. Add to `functions/tsconfig.json` `"exclude": ["src/**/*.test.ts"]`.
- [ ] **Step 2:** `firebase.json`: add `"emulators"` with the ports above, `"ui": { "enabled": true, "port": 4000 }`,
  `"singleProjectMode": true`. `.gitignore`: add `functions/.secret.local`.
- [ ] **Step 3:** `.env.emulator` (committed, no secrets): `VITE_USE_EMULATORS=1`, `VITE_FIREBASE_PROJECT_ID=demo-yune`,
  `VITE_FIREBASE_API_KEY=demo`, `VITE_FIREBASE_AUTH_DOMAIN=demo-yune.firebaseapp.com`,
  `VITE_FIREBASE_STORAGE_BUCKET=demo-yune.appspot.com`, `VITE_FIREBASE_APP_ID=demo`.
- [ ] **Step 4:** In `src/lib/firebase.ts`, when `import.meta.env.VITE_USE_EMULATORS === "1"`, call
  `connectAuthEmulator(auth, "http://127.0.0.1:9099")`, `connectFirestoreEmulator(db, "127.0.0.1", 8085)`,
  `connectStorageEmulator(storage, "127.0.0.1", 9199)`, `connectFunctionsEmulator(functions, "127.0.0.1", 5001)`.
- [ ] **Step 5:** Scripts in root `package.json`: `"test": "vitest run src"`,
  `"test:rules": "firebase emulators:exec --only firestore,storage --project demo-yune 'vitest run tests/rules'"`,
  `"emulators": "firebase emulators:start --project demo-yune"`, `"dev:emu": "vite --host --mode emulator"`.
  Functions: `"test": "vitest run --passWithNoTests"`. `vitest.config.ts` merges `vite.config.ts` (for the `@`
  alias) with `test: { environment: "node", include: ["src/**/*.test.ts", "tests/**/*.test.ts"] }`.
- [ ] **Step 6: Write tests** — `src/lib/time.test.ts`: `toLocalInput(new Date(2026, 9, 19, 8, 5))` →
  `"2026-10-19T08:05"`; `fmtDuration(400)` → `"6h40"`. `tests/rules/smoke.test.ts`: with
  `initializeTestEnvironment({ projectId: "demo-yune", firestore: { rules: readFileSync("firestore.rules") } })`,
  a verified user `alice` (`{ email_verified: true }`) can read `users/alice`; `bob` cannot (`assertFails`).
- [ ] **Step 7: Run** `npm test` → PASS (2 tests); `npm run test:rules` → PASS; `npm --prefix functions test` → exits 0
  with no test files.
- [ ] **Step 8: Run** `npm run emulators` in one terminal and `npm run dev:emu` in another; sign-up in the app
  creates a user in the emulator UI (http://127.0.0.1:4000). Stop both.
- [ ] **Step 9: Commit** — "Testes (Vitest, regras) e emuladores do Firebase".

---

### Task 2: Health math, lab catalog and pt-BR number parsing

**Files:**
- Create: `src/lib/health.ts`, `src/lib/health.test.ts`, `src/lib/labs.ts`, `src/lib/labs.test.ts`,
  `src/data/labs.json`, `src/lib/num.ts`, `src/lib/num.test.ts`
- Modify: `src/lib/firebase.ts` (types only)

**Interfaces:**
- Produces (types in `src/lib/firebase.ts`):
  ```ts
  type Table = … | "measurements" | "body_comp" | "lab_reports" | "body_photos" | "anamnesis";
  Profile.photo_path?: string | null;
  type Measurement = { id: string; measured_at: string; weight_kg: number; waist_cm: number | null; hip_cm: number | null; neck_cm: number | null; source: "manual" | "body_comp" };
  type BodyCompValues = { weight_kg: number | null; fat_pct: number | null; fat_kg: number | null; muscle_kg: number | null; lean_kg: number | null; visceral: number | null; bmr_kcal: number | null; water_l: number | null; ecw_tbw: number | null; phase_angle: number | null };
  type BodyComp = BodyCompValues & { id: string; measured_at: string; device: string; file_path: string | null; ai: boolean; created_at: string };
  type LabResult = { code: string; name: string; value: number | null; value_text: string; unit: string; ref_low: number | null; ref_high: number | null; ref_text: string };
  type LabReport = { id: string; collected_at: string; lab: string | null; results: LabResult[]; file_paths: string[]; ai: boolean; created_at: string };
  type Pose = "frente" | "lado" | "costas";
  type BodyPhoto = { id: string; taken_at: string; pose: Pose; path: string };
  ```
- Produces (functions): `parseDecimal(s: string): number | null` (`src/lib/num.ts`);
  `bmi(weightKg, heightCm)`, `waistHip(waist, hip)`, `waistHeight(waist, heightCm)`, `homaIr(glucoseMgDl, insulin)`
  — all `number | null`, null when an input is missing/≤0 (`src/lib/health.ts`);
  `bodyCompDelta(readings: BodyComp[], device: string): { since: string; fat_kg: number | null; muscle_kg: number | null; muscle_field: "muscle_kg" | "lean_kg" | null } | null`;
  `LAB_CATALOG: LabDef[]` with `type LabDef = { code: string; name: string; unit: string; chart: boolean; conversions: Record<string, number> }`;
  `normalizeResult(r: LabResult): { value: number; unit: string } | null`; `outOfRange(r: LabResult): boolean | null`;
  `unitKey(u: string): string` (`src/lib/labs.ts`).

- [ ] **Step 1: Write failing tests** `num.test.ts`: `"71,8"`→71.8, `"1.412"`→1412, `"1.412,5"`→1412.5,
  `"0,36"`→0.36, `"0.36"`→0.36, `"2"`→2, `" 82 cm"`→82, `""`→null, `"abc"`→null, `"<5"`→null.
- [ ] **Step 2: Write failing tests** `health.test.ts`: `bmi(71.8, 165)` ≈ 26.37 (toBeCloseTo 2);
  `waistHip(82, 100)` = 0.82; `waistHeight(82, 165)` ≈ 0.497; `homaIr(90, 10)` ≈ 2.22; `bmi(71.8, null)` null.
  `bodyCompDelta`: readings A (InBody, 08-12, fat 24.0, muscle 26.3), B (Tanita, 09-01, fat 30, muscle 20),
  C (InBody, 10-02, fat 20.9, muscle 26.0) → for "InBody": `{ since: A.measured_at, fat_kg: -3.1, muscle_kg: -0.3, muscle_field: "muscle_kg" }`
  (toBeCloseTo); for "Tanita" (one reading) → null; if C has `muscle_kg: null` but both have `lean_kg` →
  uses `lean_kg`, `muscle_field: "lean_kg"`; device match is case/space-insensitive ("inbody 570" == "InBody 570").
- [ ] **Step 3: Write failing tests** `labs.test.ts`: glicemia `5.0 mmol/L` → `{ value: ≈90.1, unit: "mg/dL" }`;
  vitamina D `55 nmol/L` → ≈22 ng/mL; same unit spelled "MG/DL", "mg/dl", "mg / dL" all match; result with
  `value: null, value_text: "<5"` → `normalizeResult` null and `outOfRange` null; unknown unit "xyz" → null;
  code `"outro"` → null; `outOfRange` LDL 142 with ref_high 130 → true, with no ref → null, 100 in 70–99 → true,
  85 in 70–99 → false (outOfRange compares the raw value with the lab's raw range, no conversion).
- [ ] **Step 4: Run** `npm test` → the new tests FAIL (modules missing).
- [ ] **Step 5: Implement** `parseDecimal`: comma present → strip `.` then `,`→`.`; else `^\d{1,3}(\.\d{3})+$` →
  thousands; else `.` is decimal; strip unit text/spaces first; any `<`/`>` → null.
- [ ] **Step 6: Implement** `health.ts` (HOMA-IR = glucose × insulin ÷ 405; `bodyCompDelta` = earliest vs latest
  reading of that device, muscle field chosen as the first of `muscle_kg`, `lean_kg` present in both).
- [ ] **Step 7: Implement** `labs.json` + `labs.ts`. Catalog (code, canonical unit, conversions → factor to canonical):

  | code | name | unit | conversions |
  |---|---|---|---|
  | glicemia | Glicemia de jejum | mg/dL | mmol/L 18.016 |
  | insulina | Insulina | µUI/mL | mUI/L 1, pmol/L 0.1667 |
  | hba1c | Hemoglobina glicada | % | — |
  | colesterol_total, hdl, ldl | Colesterol total / HDL / LDL | mg/dL | mmol/L 38.67 |
  | triglicerides | Triglicérides | mg/dL | mmol/L 88.57 |
  | tsh | TSH | µUI/mL | mUI/L 1 |
  | t4_livre | T4 livre | ng/dL | pmol/L 0.0777 |
  | vitamina_d | Vitamina D (25-OH) | ng/mL | nmol/L 0.4 |
  | b12 | Vitamina B12 | pg/mL | pmol/L 1.355 |
  | ferritina | Ferritina | ng/mL | µg/L 1 |
  | ferro | Ferro sérico | µg/dL | µmol/L 5.585 |
  | pcr_us | PCR ultrassensível | mg/L | mg/dL 10 |
  | tgo, tgp, ggt | TGO (AST) / TGP (ALT) / GGT | U/L | UI/L 1 |
  | creatinina | Creatinina | mg/dL | µmol/L 0.01131 |
  | ureia | Ureia | mg/dL | mmol/L 6.006 |
  | acido_urico | Ácido úrico | mg/dL | µmol/L 0.0168 |
  | hemoglobina | Hemoglobina | g/dL | g/L 0.1 |

  All `chart: true`. `unitKey`: lowercase, remove spaces, `μ`/`u`/`mc` before a unit → `µ`, `ui`=`u` handled by
  listing aliases in conversions as needed.
- [ ] **Step 8: Run** `npm test` → PASS.
- [ ] **Step 9: Commit** — "Cálculos de saúde, catálogo de exames e números em pt-BR".

---

### Task 3: Firestore and Storage rules for the new data

**Files:**
- Modify: `firestore.rules`, `storage.rules`
- Create: `tests/rules/profile.test.ts`, `tests/rules/storage.test.ts`, `storage.cors.json`

**Interfaces:**
- Consumes: types from Task 2.
- Produces: rules for `users/{uid}.photo_path`, `measurements`, `body_photos`, `anamnesis` (owner write, validated),
  `body_comp`, `lab_reports` (owner read/delete only), `billing/{uid}` (no client access), Storage paths
  `profile-photos/{uid}/{file}`, `body-photos/{uid}/{file}` (images jpeg/png/webp < 5 MB),
  `health-docs/{uid}/{file}` (pdf or images < 10 MB); all owner-only read/delete/create.

- [ ] **Step 1: Write failing tests** (`profile.test.ts`), each with `assertSucceeds`/`assertFails`:
  - alice sets `users/alice.photo_path = "profile-photos/alice/x.jpg"` ✓; `"profile-photos/bob/x.jpg"` ✗.
  - alice creates `measurements/m1` `{ measured_at: iso, weight_kg: 71.8, waist_cm: 82, hip_cm: null, neck_cm: null, source: "manual", created_at: iso }` ✓;
    `weight_kg: 10` ✗; extra key ✗; bob reading it ✗.
  - `body_photos/p1` `{ taken_at, pose: "frente", path: "body-photos/alice/a.jpg", created_at }` ✓; `pose: "x"` ✗;
    path under `meal-photos` ✗.
  - `anamnesis/2026-10-19` `{ updated_at: iso, answers: {…map…} }` ✓; doc id `"hoje"` ✗; `answers: "x"` ✗.
  - alice creating or updating `body_comp/b1` or `lab_reports/l1` ✗; reading/deleting a server-written one ✓
    (seed with `withSecurityRulesDisabled`).
  - alice reading or writing `billing/alice` ✗; writing `entitlements/alice` ✗ (existing behaviour).
- [ ] **Step 2: Write failing tests** (`storage.test.ts`): alice uploads 1 KB `image/jpeg` to each image path ✓;
  `application/pdf` to `health-docs/alice/r.pdf` ✓, to `body-photos/alice/r.pdf` ✗; 6 MB jpeg to body-photos ✗;
  bob reading alice's body photo ✗.
- [ ] **Step 3: Run** `npm run test:rules` → new tests FAIL.
- [ ] **Step 4: Implement** the rules, following the `meals` and `meal-photos` patterns. Measurements ranges:
  weight 20–400, waist/hip 30–250, neck 20–80; `source in ['manual','body_comp']`. Anamnesis doc id
  `^\d{4}-\d{2}-\d{2}$`, keys `hasOnly(['updated_at','answers'])`, `answers is map`. Add `photo_path` to
  `validProfile()` (null or `^profile-photos/<uid>/[^/]+$`).
- [ ] **Step 5:** `storage.cors.json`: allow `GET` from the Hosting origin and `http://localhost:8080` (needed for
  `getBlob` in Task 7); deploy command goes in CLAUDE.md in Task 15
  (`gcloud storage buckets update gs://<bucket> --cors-file=storage.cors.json`).
- [ ] **Step 6: Run** `npm run test:rules` → PASS.
- [ ] **Step 7: Commit** — "Regras para medidas, fotos, questionário, composição e exames".

---

### Task 4: Pro gating: new features, live entitlements, read-only history

**Files:**
- Modify: `src/lib/pro.ts`, `src/lib/firebase.ts` (`Entitlements`), `src/lib/diet.ts`, `src/App.tsx`,
  `src/screens/Today.tsx`, `src/sheets/FoodSheet.tsx`, `src/screens/Settings.tsx` (DietSection)
- Create: `src/lib/pro.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type StripeState = { status: string; until: string; cancel_at_period_end: boolean; trial_end: string | null };
  type Entitlements = { pro: boolean; until: string | null; source?: "stripe" | "beta" | null; beta_until?: string | null; stripe?: StripeState | null };
  FEATURES = { diet: "pro", labs: "pro", body_comp: "pro" } as const;
  isActive(ent: Entitlements, now?: Date): boolean;           // pro && (!until || until > now)
  type ProStatus = "trial" | "active" | "canceling" | "past_due" | "beta" | "none";
  proStatus(ent: Entitlements, now?: Date): { status: ProStatus; until: string | null };
  useEntitlements(userId): Entitlements                         // now onSnapshot
  useDietPlan(version: number): DietPlan | null                 // no longer takes `enabled`
  ```
- `canUse(ent, feature)` keeps its signature (still `true` while `PRO_OPEN`).

- [ ] **Step 1: Write failing tests** `pro.test.ts` (fixed `now = 2026-10-19T12:00Z`): `isActive` false when
  `until` is yesterday, true when null+pro; `proStatus`: stripe trialing → "trial" with `until = trial_end`;
  active + `cancel_at_period_end` → "canceling"; `past_due` → "past_due"; source beta with future `beta_until` →
  "beta"; expired everything → "none"; beta until 11-10 and stripe trialing until 11-10 → "trial".
- [ ] **Step 2: Run** `npm test` → FAIL.
- [ ] **Step 3: Implement** `isActive`, `proStatus`, `FEATURES`; switch `useEntitlements` to `onSnapshot` (unsubscribe
  on unmount).
- [ ] **Step 4: Implement read-only diet:** `useDietPlan(version)` always loads the active plan. In `App.tsx` pass
  `plan` everywhere, and `dietAllowed` to `Today` and `FoodSheet` as a new `dietOn: boolean` prop; warnings,
  `mealFor` suggestions and "Pela dieta" only when `dietOn`. `DietSection` when `!allowed && plan`: show the plan
  card (opens DietSheet) and the note "Seu plano continua aqui. Para enviar uma nova dieta, assine o Pro." with no
  upload/remove-file buttons (removing the plan stays allowed: it's their data).
- [ ] **Step 5: Run** `npm test` and `npm run build` → PASS. Manually (emulators, `PRO_OPEN` temporarily false
  locally, not committed): plan visible, no warnings.
- [ ] **Step 6: Commit** — "Pro: exames e composição, entitlements ao vivo, histórico só leitura".

---

### Task 5: Perfil screen, navigation and profile editing

**Files:**
- Create: `src/screens/Profile.tsx`, `src/sheets/ProfileEditSheet.tsx`, `src/components/PrivateImage.tsx`
- Modify: `src/App.tsx`, `src/screens/Settings.tsx`, `src/styles.css`

**Interfaces:**
- Consumes: `Profile`, `Entitlements`, `canUse` (Task 4).
- Produces:
  - `type Tab = "today" | "week" | "profile"`; tab bar's last button shows the avatar (`PrivateImage` of
    `profile.photo_path`, or initials) and `aria-label="Perfil"`.
  - `Profile({ profile, ent, version, onSaved, onPro, diet })` — renders cards (Task 6–11 fill them) and opens
    `Settings` as a sub-view with a back button ("‹ Perfil"); `Settings` gains `onBack: () => void` and loses the
    "Corpo" section.
  - `ProfileEditSheet({ profile, onClose, onSaved })` — name, sex, height, birth year, photo (camera/gallery,
    `compressImage(file, 800, 0.85)`, upload to `profile-photos/{uid}/{uuid}.jpg`, delete the old file).
  - `PrivateImage({ path, alt, className? })` — `getBlob(ref(storage, path))` → `URL.createObjectURL`, revoked on
    unmount; `draggable={false}`, `onContextMenu` prevented, class `private-img` (`-webkit-touch-callout: none;
    user-select: none`).
  - Profile cards are components in `Profile.tsx` with a shared shell `Card({ label, action?, locked?, onOpen, children })`;
    `locked` shows the Pro badge and "Conhecer o Pro" (calls `onPro`).
- [ ] **Step 1:** Build the screen per the approved mockup (`.superpowers/brainstorm/*/content/profile.html`):
  header (photo, name, age from `birth_year`, height, goal from latest anamnesis `objetivo` or nothing), then the
  six cards as placeholders with empty states ("Registre seu peso", "Envie um laudo de bioimpedância", …).
- [ ] **Step 2:** Wire navigation in `App.tsx` (keep sheets working from every tab); `sheet === "pro"` opens the Pro
  sheet (placeholder `Sheet` until Task 13).
- [ ] **Step 3: Run** `npm run build` → PASS; on emulators: change name/photo, reload, both persist; avatar shows in
  tab bar; Ajustes opens and returns; light and dark; phone width 375px upright.
- [ ] **Step 4: Commit** — "Tela Perfil, foto e edição do perfil".

---

### Task 6: Measurements and charts

**Files:**
- Create: `src/lib/measurements.ts`, `src/lib/measurements.test.ts`, `src/sheets/MeasureSheet.tsx`,
  `src/screens/MeasurementsView.tsx`, `src/components/LineChart.tsx`
- Modify: `src/screens/Profile.tsx`, `src/styles.css`

**Interfaces:**
- Consumes: `parseDecimal`, `bmi`, `waistHip`, `waistHeight` (Task 2).
- Produces:
  - `useMeasurements(version): Measurement[]` (sorted by `measured_at` asc);
    `saveMeasurement(m: Omit<Measurement, "id">, id?: string, profile: Profile): Promise<void>`;
    `deleteMeasurement(id)`; `shouldUpdateWeight(all: Measurement[], saved: Measurement): boolean` (true when
    `saved` is the newest).
  - `LineChart({ points, band?, unit, color?, compact? })` with `points: { t: string; v: number }[]`,
    `band?: { low: number | null; high: number | null }`; SVG, responsive width, `compact` = sparkline without axes.
- [ ] **Step 1: Write failing test** `measurements.test.ts`: `shouldUpdateWeight` true for the newest, false for a
  back-dated entry, true when it's the only one.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**; saving the newest also `updateDoc(profileDoc, { weight_kg })`.
- [ ] **Step 4:** `MeasureSheet` (weight required, waist/hip/neck optional, `datetime-local` default now,
  `inputMode="decimal"`, values through `parseDecimal`); `MeasurementsView` (chart per measure, computed BMI,
  waist/hip, waist/height shown, list with edit/delete); Perfil card "Peso e medidas" per mockup (latest weight,
  change vs ~8 weeks ago, compact chart).
- [ ] **Step 5: Run** `npm test`, `npm run build` → PASS; emulators: add 3 entries incl. "71,8", back-date one,
  edit, delete; profile weight follows the newest.
- [ ] **Step 6: Commit** — "Peso e medidas com gráficos".

---

### Task 7: Evolution photos

**Files:**
- Create: `src/lib/photos.ts`, `src/lib/photos.test.ts`, `src/screens/PhotosView.tsx`
- Modify: `src/screens/Profile.tsx`, `src/styles.css`

**Interfaces:**
- Consumes: `PrivateImage` (Task 5), `Measurement` (Task 6).
- Produces: `useBodyPhotos(version): BodyPhoto[]`; `addBodyPhoto(pose: Pose, file: File, takenAt: Date): Promise<void>`
  (`compressImage(file, 1600, 0.85)`, `body-photos/{uid}/{uuid}.jpg`); `deleteBodyPhoto(p: BodyPhoto)` (doc + file);
  `sessions(photos: BodyPhoto[], tz: string): { day: string; photos: Partial<Record<Pose, BodyPhoto>> }[]` grouping by local
  day (`YYYY-MM-DD`), newest first, latest photo per pose per day.
- [ ] **Step 1: Write failing test** `photos.test.ts`: two "frente" the same local day → latest kept; photos at
  `2026-10-19T02:00Z` and `2026-10-18T23:00Z` with tz `"America/Sao_Paulo"` fall on the same day `"2026-10-18"`.
  The signature is therefore `sessions(photos: BodyPhoto[], tz: string)` (tz from `profile.timezone`).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.**
- [ ] **Step 4:** `PhotosView`: pose tabs Frente/Lado/Costas; "+ Tirar fotos de hoje" uses
  `<input type="file" accept="image/*" capture="environment">`, shows the previous photo of that pose at 35% opacity
  behind a preview before saving; compare mode picks two sessions and shows weight/waist change from measurements
  closest to each date (±3 days, else hidden). Lock note copy: "Só você vê. O Yune não salva estas fotos na galeria
  nem cria links para elas." No download/share buttons.
- [ ] **Step 5: Run** `npm test`, `npm run build` → PASS; emulators: add photos for two days, compare, delete one
  (file gone from Storage emulator), long-press on iPhone shows no save menu.
- [ ] **Step 6: Commit** — "Fotos de evolução privadas".

---

### Task 8: Health questionnaire ("Sua saúde")

**Files:**
- Create: `src/lib/anamnesis.ts`, `src/lib/anamnesis.test.ts`, `src/sheets/HealthSheet.tsx`
- Modify: `src/screens/Profile.tsx`, `src/styles.css`, `src/lib/firebase.ts` (type)

**Interfaces:**
- Produces:
  - `type FieldDef = { key: string; label: string; kind: "text" | "longtext" | "choice" | "multi" | "number" | "scale" | "bristol"; options?: string[]; min?: number; max?: number }`
  - `type SectionDef = { key: SectionKey; title: string; fields: FieldDef[]; when?: (p: Profile) => boolean }`
  - `SECTIONS: SectionDef[]` with keys, in order: `objetivo`, `condicoes`, `medicamentos`, `suplementos`,
    `alergias`, `intestino`, `rotina`, `ciclo` (`when: p.sex === "f"`), `peso`, `alimentacao` — fields as listed in
    the spec's "Health questionnaire" section (GLP-1 question as `choice` Sim/Não + `text` "Qual e dose";
    Bristol as kind `bristol` 1–7 with the seven standard descriptions; stress `scale` 1–5).
  - `type Answers = Partial<Record<SectionKey, Record<string, string | number | string[] | null>>>`;
    `type Anamnesis = { id: string; updated_at: string; answers: Answers }`.
  - `dayKey(d: Date, tz: string): string`; `completion(a: Answers, p: Profile): number` (0–100, sections visible
    for `p`, a section counts when any field is non-empty); `useLatestAnamnesis(version): Anamnesis | null`;
    `saveAnswers(answers: Answers, now: Date, tz: string): Promise<void>` (setDoc `anamnesis/{dayKey}` — same day
    overwrites, new day creates).
- [ ] **Step 1: Write failing tests**: `completion` = 0 for `{}`; one of 9 visible sections (sex m) → 11; `ciclo`
  ignored for sex m and counted for f (10 sections); empty string/empty array don't count. `dayKey` for
  `2026-10-19T01:30Z` in `America/Sao_Paulo` → `"2026-10-18"`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.**
- [ ] **Step 4:** `HealthSheet`: section list with completion ticks; each section a simple form; auto-save 1 s after
  the last change (debounced) and on close; "Rotina › horas de sono" prefilled from the 14-day sleep average when
  empty. Perfil card shows "% preenchido".
- [ ] **Step 5: Run** `npm test`, `npm run build`, `npm run test:rules` → PASS; emulators: fill two sections,
  reopen, values persist; one doc per day in Firestore.
- [ ] **Step 6: Commit** — "Questionário de saúde com versões por dia".

---

### Task 9: Server: read and save health documents

**Files:**
- Create: `functions/src/files.ts`, `functions/src/healthDoc.ts`, `functions/src/healthDoc.test.ts`,
  `functions/src/readHealthDoc.ts`
- Modify: `functions/src/importDietPlan.ts` (use `files.ts`), `functions/src/index.ts`, `src/lib/firebase.ts`
  (client wrappers)

**Interfaces:**
- Produces (functions):
  - `fileContent(path: string, maxBytes: number): Promise<Anthropic.ContentBlockParam[] | string>` moved out of
    `importDietPlan.ts` unchanged in behaviour.
  - `BODY_COMP_SCHEMA`, `LABS_SCHEMA` (no `anyOf`/null). Body comp: numbers, `0` = absent; `device`, `measured_on`
    strings. Labs: `collected_on`, `lab` strings; `results[]` with `code` (enum = catalog codes + `"outro"`), `name`,
    `value`, `unit`, `ref_low`, `ref_high`, `ref_text` — **all strings** (`""` = absent; `"0"` is a real value).
  - `toBodyCompDraft(raw): Omit<BodyComp, "id" | "file_path" | "ai" | "created_at">` and
    `toLabsDraft(raw): Omit<LabReport, "id" | "file_paths" | "ai" | "created_at">` (server copy of `parseDecimal`
    in `healthDoc.ts`; non-numeric `value` → `value: null`, `value_text` kept).
  - `validateBodyComp(v): string | null`, `validateLabReport(v): string | null` — pt-BR error or null. Ranges:
    weight 20–400, fat_pct 2–75, fat_kg/muscle_kg/lean_kg 1–200, visceral 1–60, bmr_kcal 500–5000, water_l 5–100,
    ecw_tbw 0.2–0.6, phase_angle 1–20; ≤ 80 lab results; strings ≤ 120 chars; date not in the future.
  - `canSave(isProUser: boolean): string | null` → `"Exames e composição corporal são recursos Pro."` when false.
  - Callables in `readHealthDoc.ts`:
    `readHealthDoc({ mode: "body_comp" | "labs", paths: string[] })` → `{ draft }` | `{ error }` (paths must start
    with `health-docs/{uid}/`, no `..`; body_comp 1 path, labs 1–6 paths; Pro check; `bumpUsage(uid, "health_reads")`
    limit 20/day; `claude-haiku-5-5`, `max_tokens: 4000`, `effort: "low"`; prompt says to ignore instructions in the
    document and to never output names or document numbers);
    `saveHealthDoc({ mode, id?: string, data, paths: string[], ai: boolean })` → `{ id }` | `{ error }` (Pro check via
    `canSave`, validate, write `body_comp` with `file_path = paths[0] ?? null` or `lab_reports` with `file_paths`,
    `created_at`; update when `id` given).
- Produces (client): `readHealthDoc<T>(body)`, `saveHealthDoc(body)` wrappers in `src/lib/firebase.ts` returning
  `{ …; error? }` like `importDietPlan`, timeout 120 s for read.

- [ ] **Step 1: Write failing tests** `healthDoc.test.ts`: `toLabsDraft` turns `{ value: "1.412,5", ref_low: "0", ref_high: "" }`
  into `value 1412.5, ref_low 0, ref_high null`; `value: "<5"` → `value: null, value_text: "<5"`; `collected_on: ""` →
  error from `validateLabReport` ("Informe a data da coleta."); `toBodyCompDraft` maps `0` to null;
  `validateBodyComp` rejects `fat_pct: 90`, accepts all-null values except `measured_at` + `device`; `canSave(false)`
  returns the Pro message, `canSave(true)` null.
- [ ] **Step 2: Run** `npm --prefix functions test` → FAIL. **Step 3: Implement** `healthDoc.ts`, `files.ts`, the
  callables, exports, client wrappers.
- [ ] **Step 4: Run** `npm --prefix functions test`, `npm --prefix functions run build`, `npm run build` → PASS.
  Emulators with `functions/.secret.local` holding a real `ANTHROPIC_API_KEY`: call `readHealthDoc` on a sample
  InBody photo and a sample lab PDF (anonymised samples, not committed) and check the draft.
- [ ] **Step 5: Commit** — "Funções para ler e salvar laudos de exames e bioimpedância".

---

### Task 10: Body composition UI

**Files:**
- Create: `src/sheets/BodyCompSheet.tsx`, `src/screens/BodyCompView.tsx`, `src/lib/bodycomp.ts`
- Modify: `src/screens/Profile.tsx`, `src/styles.css`

**Interfaces:**
- Consumes: `readHealthDoc`, `saveHealthDoc` (Task 9), `bodyCompDelta` (Task 2), `LineChart` (Task 6),
  `canUse(ent, "body_comp")`.
- Produces: `useBodyComp(version): BodyComp[]`; `deleteBodyComp(b)` (doc + file); `uploadHealthFile(file: File): Promise<string>`
  in `src/lib/bodycomp.ts` (PDF as-is, images via `compressImage(file, 2400, 0.9)`, path
  `health-docs/{uid}/{uuid}.{pdf|jpg}`, ≤ 10 MB else throws "Arquivo grande demais (máx. 10 MB).") — reused by Task 11.
- [ ] **Step 1:** `BodyCompSheet`: choose file or "Digitar valores" → (file) upload + `readHealthDoc` with the
  "Lendo o laudo…" pulse → the "Confira os valores" form from the mockup (device, date, the ten values, each
  "não informado" when empty, chip "estimado por IA, confira" when AI) → `saveHealthDoc`. On save, if no measurement
  exists that local day and weight is set, also create a measurement with `source: "body_comp"`. Errors shown with
  `note err` like DietSection; uploaded file deleted if reading fails.
- [ ] **Step 2:** `BodyCompView`: device picker (devices present), charts for weight, fat %, fat kg, muscle (field
  from `bodyCompDelta`), visceral, BMR, phase angle when present; line "Desde <data>: −X kg gordura · −Y kg músculo";
  note "Compare sempre no mesmo aparelho e nas mesmas condições (jejum, hidratação)."; list with open file
  (`getBlob` → new tab), edit (opens sheet prefilled, saves with `id`), delete.
- [ ] **Step 3:** Perfil card per mockup. Without Pro: card locked if no readings; if readings exist, card and view
  show data, and the add/edit buttons open the Pro sheet instead.
- [ ] **Step 4: Run** `npm run build` → PASS; emulators: AI flow, manual flow, two devices kept apart, delete,
  locked + read-only states (local `PRO_OPEN=false`, not committed).
- [ ] **Step 5: Commit** — "Composição corporal: envio, conferência e evolução".

---

### Task 11: Lab exams UI

**Files:**
- Create: `src/sheets/LabSheet.tsx`, `src/screens/LabsView.tsx`, `src/lib/labreports.ts`
- Modify: `src/screens/Profile.tsx`, `src/styles.css`

**Interfaces:**
- Consumes: `uploadHealthFile` (Task 10), `readHealthDoc`/`saveHealthDoc` (Task 9), `LAB_CATALOG`,
  `normalizeResult`, `outOfRange`, `homaIr` (Task 2), `LineChart` (Task 6), `canUse(ent, "labs")`.
- Produces: `useLabReports(version): LabReport[]`; `deleteLabReport(r)` (doc + files);
  `analyteSeries(reports: LabReport[], code: string): { t: string; v: number; band: { low: number | null; high: number | null } }[]`
  (normalized values only; band converted with the same factor; skips non-numeric); `outOfRangeCount(r: LabReport): number`.
- [ ] **Step 1: Write failing test** `src/lib/labreports.test.ts`: two reports with glicemia 5.0 mmol/L (ref 3.9–5.5)
  and 95 mg/dL (ref 70–99) → series `[≈90.1 band ≈70.3–99.1, 95 band 70–99]`; a `"<5"` PCR result is skipped;
  `outOfRangeCount` counts only `outOfRange === true`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.**
- [ ] **Step 4:** `LabSheet`: pick PDF or up to 6 photos → upload all → `readHealthDoc({ mode: "labs", paths })` →
  confirm list: each row name/value/unit/range editable, analyte picker (catalog or "Outro"), remove row, add row;
  collection date required; save. `LabsView`: reports by date (open files, edit, delete) and per-analyte charts with
  the reference band for analytes that have ≥ 1 normalized value; HOMA-IR row computed when a report has both
  glicemia and insulina. Values outside the lab's range shown in `--food` color with "fora da referência do
  laboratório" — no other wording.
- [ ] **Step 5:** Perfil card per mockup; same locked/read-only behaviour as Task 10.
- [ ] **Step 6: Run** `npm test`, `npm run build` → PASS; emulators: PDF and multi-photo flows, edit, delete.
- [ ] **Step 7: Commit** — "Exames: envio, conferência e gráficos com referência".

---

### Task 12: Stripe backend

**Files:**
- Create: `functions/src/entitlement.ts`, `functions/src/entitlement.test.ts`, `functions/src/billing.ts`,
  `functions/src/billing.test.ts`
- Modify: `functions/src/index.ts`, `src/lib/firebase.ts` (client wrappers)

**Interfaces:**
- Produces (pure, `entitlement.ts`):
  - `stripeStateFrom(sub: Stripe.Subscription | null): StripeState | null` — `until` from
    `sub.items.data[0].current_period_end` (period fields live on items in current API versions), `trial_end` ISO or
    null; null when `sub` is null or status in `incomplete`, `incomplete_expired`.
  - `deriveEntitlement(src: { beta_until: string | null; stripe: StripeState | null }, now: Date): { pro: boolean; until: string | null; source: "stripe" | "beta" | null }`
    — stripe counts when status in `trialing`, `active`, `past_due` and `until > now`; beta counts when
    `beta_until > now`; result = the later of the two; neither → `{ pro: false, until: null, source: null }`.
- Produces (`billing.ts`):
  - `syncCustomer(stripe: Pick<Stripe, "subscriptions">, db, uid: string, customerId: string, now: Date): Promise<void>`
    — lists the customer's subscriptions (`status: "all"`, newest first), takes the first not `incomplete*`, writes
    `entitlements/{uid}` with `{ stripe: stripeStateFrom(sub), ...deriveEntitlement({ beta_until: <stored>, stripe }) }`
    (merge, `beta_until` untouched) and `billing/{uid}.trial_used = true` when any subscription ever had a trial.
  - `stripeWebhook` (`onRequest`): verifies `stripe.webhooks.constructEvent(req.rawBody, sig, STRIPE_WEBHOOK_SECRET)`
    (400 on failure); for `customer.subscription.created|updated|deleted`, `invoice.paid`, `invoice.payment_failed`
    reads `customer` → uid from `customer.metadata.uid` → `syncCustomer`; 200 for everything else.
  - `createCheckout({ plan: "monthly" | "annual" })` → `{ url }` | `{ error }`: error `"Você já tem o Pro."` if
    the stored stripe state is trialing/active/past_due; creates/reuses the Customer (`metadata.uid`, email) and
    stores `billing/{uid}.customer_id`; Price by lookup key; `mode: "subscription"`,
    `payment_method_types: ["card"]`, `locale: "pt-BR"`, `success_url: APP_URL + "/?pro=ok"`,
    `cancel_url: APP_URL + "/?pro=cancel"`, `client_reference_id: uid`; trial: if `beta_until` > now + 48 h →
    `subscription_data.trial_end = beta_until` (seconds); else if `!billing.trial_used && !beta ever granted` →
    `trial_period_days: 7`; else none.
  - `createPortal()` → `{ url }` | `{ error }` (`return_url: APP_URL`).
  - `getProPrices()` → `{ monthly: { amount: number; currency: string }, annual: { … } }` | `{ error }`.
  - Secrets `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (`defineSecret`); `APP_URL` via `defineString`.
- Produces (client): `createCheckout(plan)`, `createPortal()`, `getProPrices()` wrappers.

- [ ] **Step 1: Write failing tests** `entitlement.test.ts` (now = 2026-10-19T12:00Z): active stripe until 11-19 →
  pro, source stripe; canceled stripe + beta until 11-10 → pro until 11-10, source beta; trialing until 11-10 + beta
  until 11-18 → until 11-18 source beta; past_due until 10-25 → pro; `until` in the past → not pro; incomplete →
  `stripeStateFrom` null.
- [ ] **Step 2: Write failing tests** `billing.test.ts` with a fake `subscriptions.list` and an in-memory db stub:
  calling `syncCustomer` twice gives the same doc (idempotent); when the fake returns a canceled subscription
  after an active one was synced (simulating an old event arriving late), the doc reflects the canceled state;
  an existing `beta_until` is preserved.
- [ ] **Step 3: Run** `npm --prefix functions test` → FAIL. **Step 4: Implement**, export the four functions.
- [ ] **Step 5: Run** tests and both builds → PASS.
- [ ] **Step 6: Manual** — Stripe test mode: create Product "Yune Pro" with two BRL Prices and the lookup keys;
  configure the Customer Portal (cancel at period end, update card). Put test keys in `functions/.secret.local`,
  `APP_URL=http://localhost:8080` in `functions/.env.local`. Run emulators + `stripe listen --forward-to
  http://127.0.0.1:5001/demo-yune/southamerica-east1/stripeWebhook` (use the printed `whsec_` as
  `STRIPE_WEBHOOK_SECRET`). Card `4242 4242 4242 4242` → entitlement trialing; `stripe trigger` / test clock to end
  trial → active; `4000 0000 0000 0341` (fails after attach) → past_due on renewal; cancel in portal →
  `cancel_at_period_end`.
- [ ] **Step 7: Commit** — "Pro com Stripe: checkout, portal e webhook".

---

### Task 13: Pro sheet and subscription status

**Files:**
- Create: `src/sheets/ProSheet.tsx`
- Modify: `src/App.tsx`, `src/screens/Settings.tsx`, `src/styles.css`

**Interfaces:**
- Consumes: `createCheckout`, `createPortal`, `getProPrices` (Task 12), `proStatus` (Task 4).
- Produces: `ProSheet({ ent, onClose })`; Ajustes section "Yune Pro".
- [ ] **Step 1:** `ProSheet`: title "Yune Pro"; three benefits (Dieta do nutricionista, Exames com gráficos,
  Composição corporal); prices from `getProPrices` formatted `Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })`
  ("R$ 19,90/mês", "R$ 199,00/ano" style — values come from Stripe); "7 dias grátis" only when eligible (no
  `trial_used`, no beta); buttons "Assinar mensal"/"Assinar anual" → `createCheckout` → `location.href = url`;
  loading and error states. While `PRO_OPEN` is true the sheet says "Durante o beta, o Pro está liberado para todos."
  and hides the buttons.
- [ ] **Step 2:** Ajustes "Yune Pro": text by `proStatus` — trial "Teste grátis até 26/10", active "Pro até 19/11",
  canceling "Cancelado — Pro até 19/11", past_due "Pagamento pendente — atualize o cartão", beta "Pro do beta até
  18/11", none → "Conhecer o Pro" (opens ProSheet); "Gerenciar assinatura" (→ `createPortal`) when a stripe state
  exists.
- [ ] **Step 3:** On load with `?pro=ok` show a note "Assinatura recebida. O Pro libera em instantes." until the
  entitlement turns active (onSnapshot), then remove the query string (`history.replaceState`); `?pro=cancel` just
  removes it.
- [ ] **Step 4: Run** `npm run build` → PASS; manual run of the Task 12 Step 6 flows from the app UI (local
  `PRO_OPEN=false`, not committed).
- [ ] **Step 5: Commit** — "Folha do Pro e status da assinatura".

---

### Task 14: Export my data (Excel and PDF)

**Files:**
- Create: `src/lib/export.ts`, `src/lib/export.test.ts`
- Modify: `src/screens/Settings.tsx`, `package.json` (`write-excel-file@4`, `jspdf@4`, `jspdf-autotable@5`)

**Interfaces:**
- Produces:
  - `type ExportData = { profile: Profile; meals: Meal[]; water: Water[]; sleep: Sleep[]; activities: Activity[]; measurements: Measurement[]; bodyComp: BodyComp[]; labs: LabReport[]; anamnesis: Anamnesis[]; diet: DietPlan[] }`
  - `type ExportTable = { name: string; columns: string[]; rows: (string | number | null)[][] }`
  - `loadExportData(): Promise<ExportData>` (all docs of each collection, no date filter; never body photos)
  - `exportTables(d: ExportData, tz: string): ExportTable[]` — sheets in this order and names: "Perfil", "Refeições"
    (one row per item: data, refeição, item, gramas, kcal, proteína, carboidrato, gordura), "Água", "Sono",
    "Movimento", "Medidas", "Composição corporal", "Exames" (one row per result), "Questionário" (latest version,
    one row per answered field, plus a "versões" line listing dates), "Dieta" (title, prescriber, targets);
    dates as local `dd/mm/aaaa HH:mm`.
  - `downloadXlsx(tables: ExportTable[], fileName: string)` and `downloadPdf(tables: ExportTable[], profile: Profile, fileName: string)`
    — both `await import(...)` their library so it stays out of the main bundle; file name `yune-dados-AAAA-MM-DD`.
- [ ] **Step 1: Write failing test** `export.test.ts`: a meal with two items → two "Refeições" rows with the item
  grams/kcal; empty collections still produce their sheet with headers only; no table or cell mentions
  `body-photos`; lab result `"<5"` appears as text.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.**
- [ ] **Step 4:** Ajustes › "Seus dados" › "Exportar meus dados" with two buttons "Planilha (Excel)" / "PDF" and a
  busy state.
- [ ] **Step 5: Run** `npm test`, `npm run build` → PASS (main chunk not larger than before + 5 KB); emulators:
  both files open (Numbers/Excel, Preview).
- [ ] **Step 6: Commit** — "Exportar meus dados em Excel e PDF".

---

### Task 15: Seed, beta script, docs and full pass

**Files:**
- Create: `functions/scripts/seed.ts`, `functions/scripts/grantBeta.ts`
- Modify: `functions/package.json` (dev dep `tsx`), `CLAUDE.md`

**Interfaces:**
- Consumes: everything above; `deriveEntitlement` (Task 12).
- Produces: `npm --prefix functions run seed` (emulators only: refuses unless `FIRESTORE_EMULATOR_HOST` is set);
  `npm --prefix functions run grant-beta -- --days 30 [--dry-run]`.
- [ ] **Step 1:** `seed.ts` (firebase-admin against emulators, project `demo-yune`): one verified Auth user with
  test credentials written as constants at the top of the file (`paciente@yune.test`); profile (f, 1990, 165 cm,
  goals); 8 weeks of meals (TACO names with grams, 3–5 per day, some days over goal), water, sleep, 3 activities a
  week; weekly measurements 75.2 → 71.8 kg; two InBody readings (08-12, 10-02); one Tanita reading; one lab report
  with glicemia, insulina, LDL 142, vitamina D 22, ferritina 18, PCR "<5"; a filled questionnaire on two different
  days; placeholder photos (generated solid-colour JPEGs) for two sessions.
- [ ] **Step 2:** `grantBeta.ts`: for every `users/{uid}`, set `entitlements/{uid}.beta_until = now + days` and recompute
  `pro/until/source` with `deriveEntitlement` keeping the stored `stripe` state; skip users whose stored `beta_until`
  is already later; `--dry-run` prints counts only. Not run against production in this plan.
- [ ] **Step 3:** Update `CLAUDE.md`: new collections and Storage paths, Pro features, `readHealthDoc` /
  `saveHealthDoc`, Stripe functions + secrets + `APP_URL` + lookup keys, webhook URL, CORS command, emulator and
  test scripts, seed, "turning off the beta = run grant-beta, then set both PRO_OPEN to false in one release".
- [ ] **Step 4: Full pass** — `npm test`, `npm run test:rules`, `npm --prefix functions test`, `npm run build`,
  `npm --prefix functions run build` → all PASS. On emulators with the seed: walk Perfil → every card → every view,
  Ajustes, export, Pro flows with Stripe test mode (local `PRO_OPEN=false`, not committed); light and dark; iPhone
  upright (Safari, installed PWA).
- [ ] **Step 5: Commit** — "Seed do emulador, script do beta e CLAUDE.md".
- [ ] **Step 6:** Report to the user, and ask before: deploying rules/functions/hosting, setting live Stripe keys,
  applying CORS on the real bucket, running `grant-beta` in production, or switching `PRO_OPEN` off.
