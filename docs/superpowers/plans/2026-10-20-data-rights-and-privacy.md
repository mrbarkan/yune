# Data rights and privacy: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Private notifications, a new diet that replaces the old one, AI consent, "Baixar meus dados" as a zip, and "Apagar minha conta e meus dados".

**Architecture:**
- The pure helpers are unit-tested: the push text, consent checks, the zip manifest, and the delete request check and its order.
- The server code takes injected dependencies, as `reminderStep.ts` does.
- Rules changes come with rules tests.
- The UI goes in the existing Ajustes sections, plus two new sheets.

**Tech Stack:**
- React 19 + Vite 8 + TS.
- Firebase 12 and Cloud Functions v2 on Node 22.
- Vitest.
- `fflate` for the zip, which is new as a direct dependency (it is already in the lock).

**Spec:** `docs/superpowers/specs/2026-10-20-data-rights-and-privacy-design.md`

## Global Constraints

- All UI copy is pt-BR. Use the exact strings in this plan.
- Callables return a result or `{ error }`, never throw to the client.
- `PRO_OPEN` stays `true` in both files.
- Never deploy and never call real Firebase, Stripe or Anthropic. Mock billing stays as it is.
- Every task updates the matching CLAUDE.md line(s).
- `npm run check` must pass. Run `npm run test:rules` when rules change.
- Commit subjects are pt-BR imperative, like `git log`. Every message ends with the session attribution lines given in the dispatch.

## Review Focus

1. An old profile without `ai_consent` still loads and saves. In the rules, `ai_consent` is optional.
2. Reminders docs written before this change, without `push_details`, still pass the rules and default to the private text.
3. A Stripe failure during deletion deletes nothing. Every delete step is idempotent, so a retry after a mid-way failure finishes the job.
4. In the zip:
   - a file that fails to download is listed in `missing_files` and the zip is still produced;
   - body photos are absent unless the box is ticked;
   - there is never a `getDownloadURL`.
5. After consent is given in the sheet, the action runs without asking again, even before the profile reloads.

---

### Task 1: Private notifications (U-2)

**Files:**
- Modify: `functions/src/reminderStep.ts`, `functions/src/reminderStep.test.ts`
- Modify: `firestore.rules` (`validReminders`), `tests/rules/data.test.ts`
- Modify: `src/lib/defaults.ts`, `src/lib/firebase.ts` (`Reminders`), `src/screens/Settings.tsx`, `CLAUDE.md`

**Interfaces:**
- Produces:
  - `Reminders.push_details?: boolean` on the server type;
  - `push_details: boolean` on the app type;
  - `DEFAULT_REMINDERS.push_details = false`.

Steps:
- [ ] **Tests (RED)** in `reminderStep.test.ts`:
  - `"resumo sem números por padrão"`: the summary is enabled, `push_details` is absent, and the payload is `{ title: "Seu resumo do dia está pronto", body: "Toque para ver no Yune.", tag: "summary" }`. `totals` is not called.
  - `"água sem números por padrão"`: payload `{ title: "Um copo d'água?", body: "Hora de se hidratar.", tag: "water" }`.
  - `"push_details true mantém os números"`: today's texts (an existing test may cover this; set `push_details: true` there).
  - Rules (`data.test.ts`): reminders with `push_details: true` are allowed, `push_details: "sim"` is denied, and a doc without the key is allowed.
- [ ] **Implement.** `processUser` uses the detailed texts only when `r.push_details === true`; otherwise the texts above, and it skips `d.totals`. Bedtime is unchanged.
  - Rules: add `'push_details'` to `hasOnly`, plus `&& (!d().keys().hasAny(['push_details']) || d().push_details is bool)`.
  - Ajustes › Notificações: under the reminder toggles (inside `{r && …}`), add `<Toggle label="Mostrar números nas notificações" …>` with the note `"Desligado, a notificação não mostra calorias nem metas na tela bloqueada."`, saved through `saveReminders`.
- [ ] **Verify and commit.** Run `npm run check` and `npm run test:rules`, then commit.
  - CLAUDE.md, Push line: add "`reminders.push_details` (padrão false): sem números na tela bloqueada".

### Task 2: A new diet replaces the old one (U-3)

**Files:**
- Create: `functions/src/dietReplace.ts`, `functions/src/dietReplace.test.ts`
- Modify: `functions/src/importDietPlan.ts`, `src/screens/Settings.tsx` (copy only), `CLAUDE.md`

**Interfaces:**
- Produces: `replaceDiets(deps: { list(): Promise<{ id: string; file_path: string | null }[]>; create(data: Record<string, unknown>): Promise<string>; remove(id: string): Promise<void>; deleteFile(path: string): Promise<void> }, data: Record<string, unknown>): Promise<string>`.
  - It creates the new doc with `active: true` and returns its id.
  - Then, for every listed doc other than the new one: `deleteFile(file_path)` if set, then `remove(id)`.
  - A failure after the create is logged with `console.error("importDietPlan: limpeza", …)` with no content, and does not fail the import.
  - It never deletes the new doc's file.

Steps:
- [ ] **Tests (RED)**:
  - `"cria a nova e apaga as anteriores com arquivo"`;
  - `"falha ao apagar arquivo antigo não derruba a importação"`: it still returns the new id, and the other docs are still attempted;
  - `"não apaga o arquivo da dieta nova"`: the new and old docs share a `file_path`, so the guard compares paths.
- [ ] **Implement.** `importDietPlan` replaces the batch block with `replaceDiets`, using Firestore (`col.get()`, `col.add`/`doc().set`, `doc(id).delete()`) and `getStorage().bucket().file(p).delete({ ignoreNotFound: true })`.
  - Settings copy:
    - next to "Trocar arquivo", add the note `"A dieta nova substitui a atual, que é apagada."` (shown only when `plan` exists);
    - keep the "Remover dieta" text.
  - CLAUDE.md, diet line: replace "só uma `active`" with "a nova substitui e apaga as anteriores (dietReplace.ts)".
- [ ] **Verify and commit.**

### Task 3: AI consent (U-1)

**Files:**
- Create: `functions/src/consent.ts`, `functions/src/consent.test.ts`, `src/lib/consent.ts`, `src/lib/consent.test.ts`, `src/sheets/AiConsentSheet.tsx`
- Modify:
  - `functions/src/estimateFood.ts`, `functions/src/importDietPlan.ts`, `functions/src/readHealthDoc.ts` (`readHealthDoc` only, not `saveHealthDoc`);
  - `functions/src/parity.test.ts`;
  - `firestore.rules` (`validProfile`), `tests/rules/profile.test.ts`;
  - `src/lib/firebase.ts` (`Profile.ai_consent?: { at: string; version: number } | null`);
  - `src/sheets/FoodSheet.tsx`, `src/sheets/BodyCompSheet.tsx`, `src/sheets/LabSheet.tsx`, `src/screens/Settings.tsx`;
  - `src/App.tsx`, only if a prop is needed to reload the profile;
  - `CLAUDE.md`.

**Interfaces:**
- Server (`functions/src/consent.ts`):
  - `export const AI_CONSENT_VERSION = 1;`
  - `export const AI_CONSENT_ERROR = "Para usar a IA, autorize em Ajustes › Leitura por IA.";`
  - `export function hasAiConsent(user: unknown): boolean`: true iff `user.ai_consent.version >= AI_CONSENT_VERSION` and `ai_consent.at` is a string.
  - `export async function checkAiConsent(uid: string): Promise<boolean>`: reads `users/{uid}`.
  - Each AI function, right after the auth check and before `bumpUsage`, does: `if (!(await checkAiConsent(uid))) return { error: AI_CONSENT_ERROR, consent: "required" };`
- App (`src/lib/consent.ts`):
  - the same `AI_CONSENT_VERSION` and `hasAiConsent(p: Pick<Profile, "ai_consent">)`;
  - `grantAiConsent(uid): Promise<void>`: `updateDoc(profileDoc(uid), { ai_consent: { at: new Date().toISOString(), version: AI_CONSENT_VERSION } })`;
  - `revokeAiConsent(uid): Promise<void>`: sets `ai_consent: null`;
  - `useAiConsent(profile, onGranted?: () => void): { ask(run: () => void): void; sheet: React.ReactNode }`. It runs `run` at once when the person has consented or granted in this mount; otherwise it opens `AiConsentSheet`. "Concordo" grants, then runs, then calls `onGranted`; "Agora não" closes and does not run.
- Parity test: `AI_CONSENT_VERSION` is equal in both files.

Exact sheet copy (`AiConsentSheet`, `Sheet` title "Leitura por IA"):
- Paragraph: "Para estimar refeições e ler rótulos, dietas e exames, o Yune envia o texto, a foto ou o documento que você escolher para a Anthropic, empresa dos EUA que fornece a IA (Claude). Isso é uma transferência internacional de dados de saúde."
- List:
  - "Só vai o que você enviar, na hora em que enviar."
  - "A Anthropic não usa esses dados para treinar modelos."
  - "Você pode desligar quando quiser em Ajustes › Leitura por IA. Sem a IA, você continua registrando tudo à mão."
- Buttons: `btn ghost` "Agora não", `btn primary` "Concordo". On a save error: "Não foi possível salvar agora. Tente de novo."

Steps:
- [ ] **Tests (RED)**:
  - `hasAiConsent` (server and app): missing, `null`, version 0 and a missing `at` are false; `{at, version: 1}` is true.
  - The parity test.
  - Rules (`profile.test.ts`): `ai_consent` set to `{ at: ISO, version: 1 }` is allowed; `null` is allowed; absent is allowed; an extra key, a non-ISO `at`, `version: "1"` and `version: 0` are denied.
- [ ] **Implement.**
  - Server: the checks.
  - Rules: add `'ai_consent'` to the `hasOnly` list, plus `&& (d().get('ai_consent', null) == null || (d().ai_consent.keys().hasOnly(['at', 'version']) && iso(d().ai_consent.at) && d().ai_consent.version is int && num(d().ai_consent.version, 1, 100)))`.
  - Wrap the 5 AI entry points in `ask(...)`:
    - FoodSheet `estimate` (meal text or photo) and `onLabel`;
    - BodyCompSheet read;
    - LabSheet read;
    - Settings `DietSection` `onFile` and `fromText`.

    Upload/compression starts only after consent.
  - Ajustes: a new section `<h2 className="section-title">Leitura por IA</h2>` after Dieta, with:
    - `<Toggle label="Permitir que a IA leia o que eu enviar">`, where on means grant and off means revoke, followed by `onSaved()`;
    - the note "Textos, fotos de pratos e rótulos, dietas e exames vão para a Anthropic (EUA) só quando você envia.";
    - error copy "Não foi possível salvar agora. Tente de novo.".
  - CLAUDE.md: a line on `ai_consent` + `checkAiConsent` in the 3 AI functions.
- [ ] **Verify and commit.** Run `npm run check` and `npm run test:rules`.

### Task 4: Baixar meus dados (.zip)

**Files:**
- Create: `src/lib/fullExport.ts`, `src/lib/fullExport.test.ts`
- Modify: `package.json` + `package-lock.json` (`fflate` `^0.8.3` in dependencies), `src/screens/Settings.tsx` (`ExportSection`), `CLAUDE.md`

**Interfaces** (`src/lib/fullExport.ts`):
- `export type FullData = { profile: Record<string, unknown>; reminders: Record<string, unknown> | null; entitlements: Record<string, unknown> | null; collections: Partial<Record<Table, Record<string, unknown>[]>> }`
- `export const FULL_COLLECTIONS: Table[]`: every `Table` except `"push_subscriptions"`. `"body_photos"` is included only when `includeBody`.
- `export function filePaths(d: FullData, uid: string, includeBody: boolean): string[]`:
  - collects `profile.photo_path`, `meals[].photo_path`, `body_comp[].file_path`, `lab_reports[].file_paths[]` and `diet_plans[].file_path`, plus `body_photos[].path` when `includeBody`;
  - keeps only paths matching `^(meal-photos|profile-photos|body-photos|health-docs|diet-plans)/${uid}/[^/]+$`;
  - de-duplicates and sorts.
- `export const zipName = (path: string) =>` `arquivos/<pasta>/<arquivo>`, with the uid segment dropped.
- `export function manifest(d: FullData, files: string[], missing: string[], now: Date): object`:
  - `{ app: "Yune", formato: 1, exportado_em: ISO, perfil, lembretes, assinatura: entitlements, colecoes, arquivos: files.map(p => ({ caminho: zipName(p) })), arquivos_faltando: missing.map(zipName) }`;
  - the `push_subscriptions` key is never present.
- `export const LEIA_ME: string`. Plain pt-BR, under 15 lines, saying:
  - what each part is;
  - that `dados.json` holds every record;
  - that the files are the originals;
  - that body photos come only if chosen;
  - "Guarde este arquivo com cuidado: ele tem dados de saúde.".
- `export const zipFileName = (now: Date, tz: string) => \`yune-meus-dados-${localDay(now.toISOString(), tz)}.zip\``
- `export async function downloadAll(o: { includeBody: boolean; tz: string; onProgress(done: number, total: number): void }): Promise<{ missing: number }>`:
  - loads `FullData` (profile, `reminders/{uid}`, `entitlements/{uid}`, the collections);
  - fetches each file with `getBlob` (4 at a time). A failure goes to `missing`; the run continues.
  - zips with fflate `zip`: `dados.json` and `LEIA-ME.txt` at level 6, files at level 0;
  - saves through an object URL and a temporary `<a download>`, then revokes the URL.

UI (`ExportSection`):
- The note becomes "Baixe tudo o que você registrou. A planilha e o PDF trazem os registros; o arquivo .zip traz também as fotos e documentos originais.".
- New button "Baixar tudo (.zip)" with a checkbox "Incluir fotos do corpo" (default off).
- While busy, the button shows "Baixando arquivos {done}/{total}…".
- On success with missing files: note "Pronto. {n} arquivo(s) não puderam ser baixados; veja arquivos_faltando em dados.json.".
- On error: "Não foi possível baixar agora. Tente de novo.".
- Lazy-import `@/lib/fullExport`, as the current export does.

Steps:
- [ ] **Tests (RED)** for `filePaths`:
  - another uid's paths, `..` and nested paths are dropped;
  - duplicates appear once;
  - body only with the flag.

  Also `zipName`; `manifest` (no `push_subscriptions` key, missing files listed); and `zipFileName` in São Paulo time near midnight UTC.
- [ ] **Implement, verify and commit.**
  - CLAUDE.md: a line on "Baixar meus dados" (fullExport.ts, client-side zip, body photos only if chosen, free).

### Task 5: Apagar minha conta e meus dados (U-4)

**Files:**
- Create: `functions/src/deleteAccount.ts`, `functions/src/deleteAccount.test.ts`, `src/sheets/DeleteAccountSheet.tsx`
- Modify: `functions/src/index.ts`, `src/lib/firebase.ts` (wrapper), `src/screens/Settings.tsx`, `CLAUDE.md`

**Interfaces** (`functions/src/deleteAccount.ts`):
- `export const STORAGE_PREFIXES = ["meal-photos", "profile-photos", "body-photos", "health-docs", "diet-plans"] as const;`
- `export const REAUTH_SECONDS = 600;`
- `export function checkDeleteRequest(auth: { uid: string; token: { auth_time?: number } } | undefined, data: unknown, nowSec: number): { error: string; reauth?: true } | null`:
  - no auth → `{ error: "Faça login para continuar." }`;
  - `data.confirm !== "APAGAR"` → `{ error: "Digite APAGAR para confirmar." }`;
  - a missing `auth_time`, or `nowSec - auth_time > REAUTH_SECONDS` → `{ error: "Por segurança, confirme seu acesso de novo.", reauth: true }`;
  - otherwise `null`.

  Email verification is NOT required.
- `export type DeleteDeps = { customerId(uid): Promise<string | null>; deleteCustomer(id): Promise<void>; deleteFiles(prefix: string): Promise<void>; deleteDocs(uid): Promise<void>; deleteUser(uid): Promise<void> }`
- `export async function deleteAccountStep(uid, deps): Promise<void>`. The order:
  1. `customerId`;
  2. if there is one, `deleteCustomer`. Stripe cancels its subscriptions immediately; any throw aborts before any delete.
  3. `deleteFiles` for each prefix (with `${prefix}/${uid}/`);
  4. `deleteDocs`;
  5. `deleteUser`.
- The callable `deleteAccount` (region, `secrets: [STRIPE_SECRET_KEY]`):
  - `checkDeleteRequest`, then the step with real deps:
    - `customerId` reads `billing/{uid}.customer_id`;
    - `deleteCustomer`: `new Stripe(key).customers.del(id)`, ignoring `resource_missing`. When `mockBillingEnabled()`, it is a no-op.
    - `deleteFiles`: `bucket.deleteFiles({ prefix })`;
    - `deleteDocs`: `db.recursiveDelete(db.doc(\`users/${uid}\`))`, then deletes `reminders/`, `entitlements/` and `billing/{uid}`, and every `ai_usage` doc with `user_id == uid`;
    - `deleteUser`: `getAuth().deleteUser(uid)`, ignoring `auth/user-not-found`.
  - Returns `{ ok: true }`. On failure: `console.error("deleteAccount", uid, err.name)` and `{ error: "Não foi possível apagar agora. Nada foi cobrado a mais; tente de novo." }`.
- App: `deleteAccount(): Promise<{ ok?: true; error?: string; reauth?: true }>` in `firebase.ts`, with the usual try/catch (timeout 120 s).

`DeleteAccountSheet` (`Sheet` title "Apagar minha conta"):
- Text: "Isto apaga para sempre seu perfil, seus registros, fotos, exames, dietas e lembretes, e cancela o Pro na hora, sem cobranças futuras. Não dá para desfazer." and "Se quiser guardar uma cópia, use antes “Baixar tudo (.zip)”.".
- Re-auth:
  - **Password provider:** a `type="password"` field "Sua senha". Use `reauthenticateWithCredential(EmailAuthProvider.credential(email, pw))`; `auth/wrong-password` / `auth/invalid-credential` → "Senha incorreta.".
  - **Otherwise:** the button "Confirmar com Google" or "Confirmar com Apple", via `reauthenticateWithPopup`. On failure: "Não foi possível confirmar. Saia, entre de novo e volte aqui em até 10 minutos.".
- A field "Digite APAGAR para confirmar". The `btn danger` "Apagar tudo" is enabled only when the word matches (trimmed, uppercase) and re-auth is possible.
- Sequence: re-auth → `disablePushQuietly()` → `deleteAccount()`.
  - On success, the sheet shows "Conta apagada. Obrigado por ter usado o Yune." with the button "Fechar", which calls `signOut(auth)`.
  - `reauth` → that message.
  - An error → show it.
- Ajustes "Seus dados": the link `<button className="link danger">Apagar minha conta e meus dados</button>` opens the sheet. Add `.link.danger` CSS with the existing danger token if missing.

Steps:
- [ ] **Tests (RED)**:
  - `checkDeleteRequest`: all 4 branches, plus the `auth_time` boundary at exactly 600 s, which is allowed;
  - `deleteAccountStep`: the call order is recorded; `deleteCustomer` throwing means no file, doc or user deletes; there is no customer → no `deleteCustomer` call; every prefix is called with `/${uid}/`.
- [ ] **Implement, verify and commit.**
  - CLAUDE.md: a line on `deleteAccount` (order, re-auth of 10 min, `APAGAR`, Stripe customer deleted, no-op in the mock).
