# Registrar com menos esforço: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make logging cheap for people who won't log in the moment:
- recipes, so a batch is saved once and a portion is one tap;
- named water containers, with drinks from meals counting toward water;
- a gap nudge plus a night review ("Fechar o dia") that recover forgotten snacks and meals.

**Architecture:** Pure logic lives in small modules under `src/lib/` and `functions/src/`, with Vitest tests:
- `recipes.ts`, `plate.ts`, `fluids.ts`, `gaps.ts`, and `snackNudge` inside `reminderStep.ts`.

The UI reuses the existing sheets (`FoodSheet`, `WaterSheet`) and adds two new ones (`SnackSheet`, `CloseDaySheet`). Firestore rules gain two owner-only collections (`recipes`, `day_reviews`) and two new fields (`water_containers` on the profile, gap fields on `reminders`). The server nudge is a new step in `processUser`, with its dependencies injected.

The work ships as **three PRs, stacked**:
- Part A on branch `claude/easier-logging-recipes`, based on `claude/health-tracking-app-9p3eer`.
- Part B on `claude/easier-logging-water`, based on A.
- Part C on `claude/easier-logging-snacks`, based on B.

**Tech Stack:**
- React 19 + Vite 8 + TypeScript 7, using CSS tokens in `src/styles.css`.
- Firebase 12 (Firestore, rules), with Cloud Functions on Node 22.
- Vitest 5; rules tests run with `@firebase/rules-unit-testing`.

**Spec:** `docs/superpowers/specs/2026-10-28-easier-logging-design.md`

## Global Constraints

- **Text:** all UI text is pt-BR. Code comments are in Portuguese, matching the surrounding code: short and sparse.
- **Free:** nothing here goes behind `FEATURES` / `canUse`. Everything is free.
- **Styling:**
  - Use the existing tokens. The second glass layer is a tint of `--water`; no new pigment.
  - No decorative shadows, which the CSS header forbids.
- **Dates:** ISO strings in UTC (`new Date().toISOString()`), as everywhere else.
- **New collections** live under `users/{uid}`, owner-only through `owner(uid)`, which already enforces the `deleting/{uid}` lock.
- **Data rights:**
  - Every new collection goes into `FULL_COLLECTIONS` in `src/lib/fullExport.ts` and is mentioned in `LEIA_ME`.
  - `deleteAccount` already deletes `users/{uid}` recursively, so it needs no change.
- **Notifications:** gap nudges never show numbers, whatever `push_details` says. At most 2 gap nudges a day, and never the same gap twice.
- **AI:** `estimateFood` is unchanged. Drink detection is app-side and name-based.
- **Alcohol never counts as fluid:** cerveja, vinho, aguardente/cachaça/pinga, destilados (vodka, whisky, gin, rum, tequila), "drink", caipirinha.
- **Slots:** meal slot boundaries come from `mealName` in `src/sheets/FoodSheet.tsx`: Café 5–11, Almoço 11–15, Lanche 15–18, Jantar 18–23, Ceia otherwise. Move it to `src/lib/slots.ts` (Task C1) and re-export it from FoodSheet so existing imports keep working.
- **Verification:** each part ends green on `npm run check`, `npm run build` and `npm run test:rules`.
- **Commits** end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. PR bodies end with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- **CLAUDE.md** gets one short bullet per part, in the same style as the existing ones.

## Review Focus

1. **Yield or portion of 0, empty, or "comi" bigger than "rendeu"** (Batch dialog). Expected: the save button stays disabled and an inline note explains, with no division by zero and no NaN kcal. Pinned in A1 (`recipeFood` with 0 yield throws) and A4 (`batchValid`).
2. **Drink names that look like drinks but aren't:** "Leite condensado", "Achocolatado, pó", "Café, pó, torrado", "Vitamina C", "Caldo de carne, tablete", "Leite em pó". Expected: they don't count. Pinned in B1.
3. **Old data without the new fields:**
   - Meals without `ml`, and profiles with `water_sizes` but no `water_containers`.
   - `reminders` docs without `gap_enabled`, which must be treated as on.
   - Expected: everything renders and counts as before, with no crash. Pinned in B2/B3/C6.
4. **Day boundaries and time zones:** a review of yesterday opened after midnight, and gaps that cross the waking-window edges. Expected: chips log into the reviewed day, not today. Pinned in C1 (`findGaps` with a past day) and C5 (time passed to `quickLog`).
5. **A notification tapped while the app is already open:** the existing service worker only focuses the window and drops the URL. Expected: the app opens the snack or review sheet. Pinned in C5 (App reads params on `popstate`/load, and the SW calls `client.navigate`).

---

## Part A: Receitas + Repetir in another size (PR 1)

### Task A1: Recipe types and math

**Files:**
- Create: `src/lib/recipes.ts`, `src/lib/recipes.test.ts`
- Modify: `src/lib/firebase.ts` (types `Recipe`, `FoodItem.recipe_id`, `Table` += `"recipes"`), `src/lib/foods.ts` (`Food.source` += `"receita"`, `Food.recipe_id?`, `SOURCE_WEIGHT.receita = 0`)

**Interfaces:**
- Produces:
  - `type RecipeUnit = "ml" | "g" | "porcoes"`
  - `type Recipe = { id: string; name: string; items: FoodItem[]; yield_amount: number; yield_unit: RecipeUnit; created_at: string; updated_at: string }`
  - `FoodItem` gains `recipe_id?: string`
  - `recipeTotals(items: FoodItem[]): { grams: number; kcal: number; protein_g: number; carbs_g: number; fat_g: number }`
  - `gramsPerUnit(r: Pick<Recipe, "items" | "yield_amount" | "yield_unit">): number`: 1 for ml/g (1 ml ≈ 1 g); `totalGrams / yield_amount` for porções
  - `recipeFood(r: Recipe): Food`, with key `receita:${id}`, source `"receita"`, `recipe_id`, and values per 100 g = totals / (yield_amount × gramsPerUnit) × 100. It throws `Error("rendimento inválido")` when yield_amount ≤ 0.
  - `amountToGrams(r, amount: number): number` = amount × gramsPerUnit
  - `suggestRecipeName(items: FoodItem[]): string`: the first two item names joined with " e ", cut at 40 chars with "…"
  - `UNIT_LABEL: Record<RecipeUnit, string>` = `{ ml: "ml", g: "g", porcoes: "porções" }`

- [ ] **Step 1: Write failing tests** in `src/lib/recipes.test.ts`:
  - Shake fixture: items milk 400 g / 248 kcal, banana 86 g / 77 kcal, Nescau 20 g / 76 kcal, Nescau aveia 20 g / 74 kcal, `yield_amount: 500, yield_unit: "ml"`.
  - `nutrition(recipeFood(shake), amountToGrams(shake, 200)).kcal` === `Math.round(475 * 200 / 500)` (190).
  - A `recipeFood(shake).portions` label contains `"200 ml"`, and one portion has `g === 250` (metade) and one `g === 500` (tudo).
  - Porções recipe: feijão 1200 g / 900 kcal, `yield_amount: 6, yield_unit: "porcoes"`. `gramsPerUnit` === 200, the first portion is `{ label: "1 porção", g: 200 }`, and `nutrition(food, 200).kcal` === 150.
  - `recipeFood({ ...shake, yield_amount: 0 })` throws.
  - `suggestRecipeName([{name:"Leite semidesnatado"…},{name:"Banana"…},{name:"Nescau"…}])` === `"Leite semidesnatado e Banana"`.
- [ ] **Step 2: Run** `TZ=America/Sao_Paulo npx vitest run src/lib/recipes.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the types and functions above.
  - **Portions:**
    - ml: `copo (200 ml)` (only if yield ≥ 200), `metade (N ml)`, `tudo (N ml)`.
    - g: `metade (N g)`, `tudo (N g)`.
    - porções: `1 porção`, `½ porção`.
    - The existing "pesei" field covers other amounts.
  - `search` = `searchText(name)`. Export `searchText` from foods.ts for this.
- [ ] **Step 4: Run** the tests again. Expected: PASS. Then run `npx tsc --noEmit`. Expected: no errors.
- [ ] **Step 5: Commit** `Receitas: tipos e cálculo de porções`.

### Task A2: Recipe rules, export, rules tests

**Files:**
- Modify: `firestore.rules` (new `match /recipes/{id}` inside `users/{uid}`), `src/lib/fullExport.ts` (`FULL_COLLECTIONS` += `"recipes"`; LEIA_ME line lists "receitas"), `src/lib/fullExport.test.ts`, `tests/rules/data.test.ts`

**Interfaces:**
- Consumes: the `Recipe` shape from A1.

The rule:
- read, delete: `owner(uid)`.
- create: `owner(uid)` && keys hasOnly `['name','items','yield_amount','yield_unit','created_at','updated_at']` && `text(name,1,80)` && `items is list && items.size() >= 1 && items.size() <= 60` && `yield_unit in ['ml','g','porcoes']` && `num(yield_amount, 0.5, 20000)` && `iso(created_at)` && `iso(updated_at)`.
- update: the same, plus `d().created_at == resource.data.created_at`.

- [ ] **Step 1: Write failing rules tests** (`describe("regras: dados")`, new `it("receitas: …")`):
  - alice creates a valid recipe → succeeds.
  - bob reads alice's → fails.
  - Each of these fails: `yield_unit: "copo"`, `yield_amount: 0`, `items: []`, a 61-item list, an extra key `owner: "bob"`, and an update changing `created_at`.
- [ ] **Step 2: Run** `npm run test:rules`. Expected: the new test FAILS.
- [ ] **Step 3: Add the rule.** Add `"recipes"` to `FULL_COLLECTIONS`, and add "receitas" to the LEIA_ME list of what `dados.json` holds. Update `fullExport.test.ts` if it pins the list.
- [ ] **Step 4: Run** `npm run test:rules` and `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `Receitas: regras, exportação e testes`.

### Task A3: Recipes in the meal sheet (search, Frequentes, logging)

**Files:**
- Modify: `src/sheets/FoodSheet.tsx`

**Interfaces:**
- Consumes: `recipeFood`, `Recipe`, `Food.recipe_id` (A1).
- Produces: a saved meal item from a recipe carries `recipe_id`.

Specifics:
- **Load recipes** with the existing `useEffect` loads: `getDocs(q(table("recipes"), orderBy("updated_at", "desc")))` → `recipes: Food[]` via `recipeFood`. Skip any that throw.
- `pool = [...custom, ...recipes, ...history.foods, ...]`.
- Frequentes chips = `[...recipes.slice(0, 3), ...custom.slice(0, 4), ...frequent]`.
- **In `save()`**, an item whose `food.recipe_id` is set writes `recipe_id` on the `FoodItem`.
- Result rows show `· receita` the way `· meu item` is shown.

- [ ] **Step 1:** Implement.
- [ ] **Step 2: Verify.**
  - Run `npm run check`. Expected: PASS.
  - Run `npm run dev:emu` with the emulators and seed, and create a recipe doc in the Emulator UI. Search its name: it appears with "receita", adding "copo (200 ml)" shows the scaled kcal, and the saved meal item has `recipe_id`.
- [ ] **Step 3: Commit** `Receitas na busca e nos frequentes`.

### Task A4: "Fiz mais do que comi"

**Files:**
- Create: `src/sheets/BatchCard.tsx`
- Modify: `src/sheets/FoodSheet.tsx`, `src/lib/recipes.ts` (+ test), `src/styles.css`

**Interfaces:**
- Consumes: A1.
- Produces:
  - `batchValid(yieldAmount: number, eaten: number): string | null`: null when OK. Otherwise the pt-BR message:
    - "Informe quanto rendeu." when yield ≤ 0;
    - "Informe quanto você comeu." when eaten ≤ 0;
    - "Você comeu mais do que rendeu?" when eaten > yield.
  - `<BatchCard items={PlateLine[]} onCancel onSave={(r: { name; picked: string[]; yield_amount; yield_unit; eaten }) => Promise<void>} />`. `picked` = the ids of the ticked plate items.

Behavior:
- **The link** `Fiz mais do que comi` (a `.link` button under the plate list) shows when `plate.length >= 2`. It opens the card in place, like `label-card`.
- **The card holds:**
  - The checkbox list of plate items, all unchecked.
  - Name (prefilled with `suggestRecipeName` of the ticked items, updating until the person types).
  - "Rendeu" number + a `Segmented` for ml / g / porções.
  - "Comi/tomei" number in the same unit.
- **Saving** is disabled until ≥ 1 item is ticked and `batchValid` returns null, and the message shows under the fields. On save:
  - `addDoc(table("recipes"), { name, items: <FoodItems of ticked lines, as built in save()>, yield_amount, yield_unit, created_at: now, updated_at: now })`.
  - Then remove the ticked lines and add `recipeFood(saved)` with portion `{ label: \`${fmt(eaten)} ${UNIT_LABEL[unit]}\`, g: amountToGrams(saved, eaten) }` and qty 1.
  - Then add the recipe to the in-memory `recipes`.
  - A write failure shows "Não foi possível salvar a receita." and changes nothing on the plate.

- [ ] **Step 1: Failing test** in `recipes.test.ts`: `batchValid(500, 200)` → null; `batchValid(0, 200)`, `batchValid(500, 0)` and `batchValid(500, 600)` → the three messages above.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** `batchValid`, `BatchCard`, and the FoodSheet wiring.
- [ ] **Step 4: Verify.**
  - Run `npm run check`. Expected: PASS.
  - In the emulator, plate eggs + bread + milk + banana + 2 Nescau. Tick the four shake items, rendeu 500 ml, tomei 200. The plate now shows eggs, bread and "Leite… e Banana · 200 ml", and the kcal total equals eggs + bread + 40% of the shake. The recipe doc exists.
- [ ] **Step 5: Commit** `Fiz mais do que comi: salva o preparo e registra a porção`.

### Task A5: Plate-wide size row

**Files:**
- Create: `src/lib/plate.ts`, `src/lib/plate.test.ts`
- Modify: `src/sheets/FoodSheet.tsx`, `src/styles.css`

**Interfaces:**
- Produces:
  - `SCALES = [0.5, 0.75, 1, 1.5, 2] as const`
  - `rescale(qtys: number[], from: number, to: number): number[]`: each `q × to / from`, rounded to 2 decimals and at least 0.05.

Behavior:
- **State** `scale` (starts at 1, and resets to 1 when the plate becomes empty). With `plate.length > 1`, a chip row "½ · ¾ · 1 · 1½ · 2" sits above the plate list, with the current one `on`.
- **Tapping a chip** sets every item's qty with `rescale` from the current scale to the tapped one.
- The per-item steppers keep their 0.5 steps and show qty with a comma (`0,75`).

- [ ] **Step 1: Failing tests:**
  - `rescale([1, 2], 1, 0.5)` → `[0.5, 1]`.
  - `rescale([0.5], 0.5, 1)` → `[1]`.
  - `rescale([1], 1, 0.75)` → `[0.75]`.
  - `rescale([0.1], 2, 0.5)` → `[0.05]`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run `npm run check`. Expected: PASS. In the browser, Repetir a 3-item meal, then tap ¾: all three kcal values drop by 25%.
- [ ] **Step 5: Commit** `Repetir em outro tamanho: escala do prato inteiro`.

### Task A6: Ajustes › Minhas receitas

**Files:**
- Create: `src/components/RecipesSection.tsx`
- Modify: `src/screens/Settings.tsx` (render `<RecipesSection profile={p} />` after the Metas group), `src/sheets/FoodSheet.tsx` (prop `recipe?: Recipe`)

**Interfaces:**
- Consumes: A1. Also `FoodSheet` gains `recipe?: Recipe` and `onSavedRecipe?: () => void`.

Behavior:
- **The section** "Minhas receitas":
  - It lists the recipes (name, "rende 500 ml", kcal of the whole batch).
  - The empty state reads: "Ainda nenhuma. No registro de comida, use “Fiz mais do que comi”."
- **Tapping a recipe** expands it inline:
  - Name and yield fields (amount + unit), saved with `updateDoc(..., { name, yield_amount, yield_unit, updated_at })`.
  - "Editar ingredientes": opens `FoodSheet` with `recipe` set.
  - "Apagar": a two-step confirm, like the timeline's Editar/Apagar pattern.
- **FoodSheet with `recipe`:**
  - The title is the recipe name, and the plate starts from `recipe.items` (via `plateFromMeal`-like mapping).
  - It hides the time pill, place, photo, label, diet chips and the Batch link.
  - The save button reads `Salvar receita · N kcal` and writes `{ items, updated_at }` to the recipe.
  - Meals already logged are untouched.

- [ ] **Step 1:** Implement.
- [ ] **Step 2: Verify.** Run `npm run check`. Expected: PASS. In the browser: rename, change the yield, edit the ingredients (remove the banana), then delete. Old meals keep their kcal.
- [ ] **Step 3: Update CLAUDE.md** (one bullet: `recipes` collection, `recipeFood`, "Fiz mais do que comi", Minhas receitas). Commit `Minhas receitas em Ajustes`.
- [ ] **Step 4: Push and open PR 1** against `claude/health-tracking-app-9p3eer`.

---

## Part B: Water containers + drinks count (PR 2, branch `claude/easier-logging-water` from A)

### Task B1: Drink detection

**Files:**
- Create: `src/lib/fluids.ts`, `src/lib/fluids.test.ts`
- Modify: `src/lib/foods.ts` (TACO rows of category 8 get `drink: true` unless alcoholic; `Food.drink?: boolean`), `src/lib/firebase.ts` (`FoodItem.ml?: number`), `src/sheets/FoodSheet.tsx` (`save()` writes `ml`; the plate shows a note)

**Interfaces:**
- Produces:
  - `isAlcohol(name: string): boolean`
  - `isDrinkName(name: string): boolean`
  - `drinkMl(food: Pick<Food, "name" | "drink" | "source"> & { unit?: RecipeUnit }, grams: number): number | null`. It returns null for alcohol. Otherwise it returns `Math.round(grams)` when `food.drink`, or when it's a recipe with unit `ml`, or when `isDrinkName(food.name)`. Otherwise null.
  - `mealDrinkMl(items: FoodItem[] | null | undefined): number`: the sum of `it.ml ?? 0`.

`isDrinkName` matches on `norm(name)`:
- **Yes:** `suco`, `refrigerante`, `cafe` (but not `po`/`torrado`), `cha ` / `cha$`, `leite` (but not `condensado|em po|po\b|de coco em po`), `agua de coco`, `bebida`, `shake`, `vitamina` (but not `vitamina [a-e]\b`), `isotonic`, `kombucha`, `cappuccino|capuccino` (but not `po`), `caldo de cana`, `limonada`, `mate`, `achocolatado` (but not `po`), `iogurte liquido|bebida lactea`.
- **No:** a `\bpo\b` word, or alcohol.

For recipes, `recipeFood` adds `drink: r.yield_unit === "ml"`.

The plate note under Facts reads `Conta como N ml de líquido`, where N is the sum of the lines' `drinkMl`. It shows only when N > 0.

- [ ] **Step 1: Failing tests:**
  - These count: "Café coado (sem açúcar)" 200 → 200; "Suco de laranja" 300 → 300; "Leite integral" 200 → 200; "Água de coco" → yes; "Shake de whey" → yes; "Vitamina de banana" → yes.
  - These don't: "Cerveja pilsen" → null; "Caipirinha" → null; "Leite condensado" → null; "Leite em pó" → null; "Achocolatado, pó" → null; "Café, pó, torrado" → null; "Vitamina C" → null; "Caldo de carne, tablete" → null; "Banana" → null.
  - A `{drink: true}` TACO food → counts; an `ml` recipe food → counts.
  - `mealDrinkMl([{ml: 200}, {}, {ml: 50}])` → 250; `mealDrinkMl(null)` → 0.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run check`. Expected: PASS.
- [ ] **Step 5: Commit** `Bebidas das refeições: detecção e ml no item`.

### Task B2: Fluid totals everywhere + the two-layer glass

**Files:**
- Modify:
  - `src/lib/data.ts`: `totals()` gains `drinksMl` and `fluidMl`, and `waterMl` stays plain water. `waterMlOn` is replaced by `fluidsOn(day): Promise<{ water: number; drinks: number }>`, which queries water and meals for the day.
  - `src/lib/waterView.ts` (+ test): `waterView` takes `base: { water: number; drinks: number } | null` and returns `total`, `water`, `drinks`.
  - `src/sheets/WaterSheet.tsx`, `src/screens/Today.tsx`, `src/screens/Week.tsx`, `src/styles.css`.

**Interfaces:**
- Consumes: `mealDrinkMl` (B1).
- Produces:
  - `totals(d).fluidMl`, `totals(d).drinksMl`.
  - `fluidsOn(day: Date)`.
  - `fluidLabel(totalMl: number, waterMl: number): string` in `src/lib/fluids.ts`: `"1,6 L · 1,1 L de água"`, or just `"1,6 L"` when they're equal (built with `fmtLiters`).

Behavior:
- **Today:** the Água instrument shows `fluidMl` and its bar uses `fluidMl`. The sub line becomes `${fluidLabel-second-part or "de X L"}`; when drinks > 0, show `"1,1 L de água · meta 2 L"`.
- **Week:** "Água por dia" averages `fluidMl`.
- **WaterSheet glass:** two fills. `.glass-fill` is water with height = water/goal. A new `.glass-fill.drinks` sits at `bottom: water%` with height = drinks/goal, `opacity: 0.18`, and a top line in `--water`. The combined height is capped at 100%. The big number is the total; under it, a `small` line shows `fluidLabel` when drinks > 0. The glass `aria-label` includes both values.

- [ ] **Step 1: Failing tests:**
  - `waterView({ base: { water: 1100, drinks: 500 }, failed: false }, 250)` → `total 1850, water 1350, drinks 500`. The existing failure cases still pass with the new shape.
  - `fluidLabel(1600, 1100)` → `"1,6 L · 1,1 L de água"`; `fluidLabel(1100, 1100)` → `"1,1 L"`.
  - `totals()` on a DayData with a meal whose items carry `ml: 200` → `drinksMl 200, fluidMl = water + 200`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify.** Run `npm run check`. Expected: PASS. In the browser, log coffee 200 ml with a meal: Today's Água rises by 0,2 L, and the glass shows the lighter layer above the water.
- [ ] **Step 5: Commit** `Água conta as bebidas, com a água pura à parte no copo`.

### Task B3: Named containers ("Meus recipientes") with ½

**Files:**
- Modify: `src/lib/firebase.ts` (`Profile.water_containers?: WaterContainer[]`, `type WaterContainer = { name: string; ml: number }`), `src/lib/waterView.ts` (+ test), `src/sheets/WaterSheet.tsx`, `firestore.rules`, `tests/rules/profile.test.ts`, `src/styles.css`

**Interfaces:**
- Produces:
  - `containersOf(p: Pick<Profile, "water_containers" | "water_sizes">): WaterContainer[]`: returns `water_containers` when it has 1–6 entries; else `(water_sizes?.length === 4 ? water_sizes : DEFAULT_WATER_SIZES).map((ml) => ({ name: "Copo", ml }))`.
  - `validContainers(list: WaterContainer[]): string | null`. The messages:
    - "De 1 a 6 recipientes.";
    - "Dê um nome a cada recipiente." (when a name is empty or longer than 40);
    - "Use valores entre 10 e 3000 ml." (when ml isn't an int in 10–3000).

Rules:
- `validProfile` keys += `'water_containers'`, with `(get null) == null || validWaterContainers(v)`.
- `validWaterContainers(v)` = `v is list && v.size() >= 1 && v.size() <= 6 && c(v,0) && … && c(v,5)`, where `c(v,i) = v.size() <= i || (v[i] is map && v[i].keys().hasOnly(['name','ml']) && text(v[i].name,1,40) && v[i].ml is int && num(v[i].ml,10,3000))`.

WaterSheet:
- **Buttons:** one per container, with the name on top and `+N ml` below. Each has a small `½` button beside it, which logs `Math.round(ml / 2)`; at least 10, since the rules need ≥ 10.
- **"Meus recipientes"** replaces "Ajustar copos":
  - Rows of name + ml inputs, with ↑ ↓ buttons to reorder and × to delete (disabled with 1 left).
  - "Adicionar recipiente" (hidden at 6).
  - "Salvar" checks `validContainers` and writes `water_containers` only.
- **EditWater** size chips come from `containersOf(...).map(c => c.ml)`.

- [ ] **Step 1: Failing tests:**
  - `containersOf({})` → 4 "Copo" entries with DEFAULT_WATER_SIZES.
  - `containersOf({ water_sizes: [100,200,300,400] })` maps them.
  - `containersOf({ water_containers: [{name:"Garrafa", ml:750}] })` returns it.
  - `validContainers` → each of the three messages, and null for a valid list.
  - Rules: alice's profile update with valid containers succeeds. These fail: 7 entries, `ml: 5`, `ml: 250.5`, name "", an extra key `color`.
- [ ] **Step 2: Run** `npm test` and `npm run test:rules`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run check` and `npm run test:rules`. Expected: PASS. In the browser, add "Garrafa · 750", tap ½, and the glass gains 375 ml.
- [ ] **Step 5: Commit** `Meus recipientes: garrafa e copos com nome, e meia garrafa`.

### Task B4: Server totals, water reminder and export count drinks

**Files:**
- Create: `functions/src/fluids.ts`, `functions/src/fluids.test.ts`
- Modify: `functions/src/sendReminders.ts` (`dailyTotals.water_ml` adds the meals' `mealDrinkMl`; `hasWaterSince` also returns true if any meal since `since` has an item with `ml > 0`), `src/lib/export.ts` (+ `export.test.ts`)

**Interfaces:**
- Produces: `mealDrinkMl(items: unknown): number` (server copy, defensive about non-arrays and non-numbers).

The Excel export: the "Água" sheet becomes columns `["Data", "ml", "Tipo"]`. Water rows get Tipo `"Água"`. Each meal item with `ml > 0` adds a row `[f(meal.eaten_at), ml, item.name]`. The rows are sorted by date *(this replaces the spec's "Água pura" column: the sheet is one row per record, not per day)*.

- [ ] **Step 1: Failing tests:**
  - `mealDrinkMl([{ml:200},{ml:"x"},{}])` → 200; `mealDrinkMl(null)` → 0.
  - The export test: a meal with a 200 ml coffee item produces a row with `"Café coado (sem açúcar)"` and 200 in the "Água" table.
- [ ] **Step 2: Run** `npm run test:all`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run check`. Expected: PASS.
- [ ] **Step 5: Update CLAUDE.md** (bullet: `items[].ml`, `drinkMl`, `water_containers`, the glass layers, alcohol excluded). Commit `Servidor e exportação contam as bebidas`. Push and open PR 2 against `claude/easier-logging-recipes`.

---

## Part C: Gap nudge, snack sheet, Fechar o dia (PR 3, branch `claude/easier-logging-snacks` from B)

### Task C1: Slots, gaps, missing meals and snack chips (pure)

**Files:**
- Create: `src/lib/slots.ts`, `src/lib/gaps.ts`, `src/lib/gaps.test.ts`
- Modify: `src/sheets/FoodSheet.tsx` (`export { mealName } from "@/lib/slots"`)

**Interfaces:**
- Produces:
  - `mealName(d: Date): string` (moved as is).
  - `type Gap = { key: string; from: string; to: string }`, where key = `from`.
  - `type MissingSlot = { key: string; slot: "Café da manhã" | "Almoço" | "Jantar"; at: string }`, where key = `slot:${slot}` and at = the ISO of the slot middle (08:00, 13:00, 20:00 local) on that day.
  - `GAP_MS = 4 * 3_600_000`
  - `findGaps(mealsAt: string[], now: Date): Gap[]`: only between two consecutive logged meals of the day (sorted), where `to - from >= GAP_MS`.
  - `missingSlots(mealsAt: string[], day: Date, now: Date): MissingSlot[]`: Café (5–11), Almoço (11–15) and Jantar (18–23) with no meal whose `mealName` is that slot. Only slots whose end has passed: for today, `now >= slotEnd`; for past days, all of them.
  - `snackChips(history: Meal[], limit = 6): Meal[]`: meals whose `mealName(eaten_at)` is "Lanche" or "Ceia" and that have `items?.length`, grouped by `norm(description)`, ranked by count (ties → most recent), returning the most recent meal of each group.
  - `slotChips(history: Meal[], slot: MissingSlot["slot"], limit = 4): Meal[]`: the same grouping for one slot.
  - `midpoint(a: string, b: string): string` (ISO).

- [ ] **Step 1: Failing tests** (TZ=America/Sao_Paulo is set by `npm test`):
  - **Gaps:**
    - Meals at 07:40, 12:30 and 20:10 on 2026-10-27, with now = 21:30 → one gap `{ from: 12:30, to: 20:10 }`.
    - Meals at 07:40 and 10:00 → no gap.
    - A single meal → no gaps.
  - **Missing slots:**
    - Meals [12:30] at 21:30 today → `["Café da manhã", "Jantar"]`.
    - The same at 10:00 today → `[]` (breakfast is still open until 11).
    - A past day with no meals → all three.
  - **Snack chips:**
    - History of 3× "Iogurte, granola" at 16:00, 1× "Banana" at 16:30 and 2× "Arroz, feijão" at 12:30 → `["Iogurte, granola", "Banana"]`.
    - A meal at 23:30 counts as Ceia.
  - **Slot chips:** `slotChips(..., "Almoço")` returns "Arroz, feijão".
  - **Midpoint:** `midpoint("2026-10-27T15:30:00.000Z", "2026-10-27T23:10:00.000Z")` → `"2026-10-27T19:20:00.000Z"`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run check`. Expected: PASS.
- [ ] **Step 5: Commit** `Lanches: intervalos, refeições faltando e atalhos`.

### Task C2: day_reviews collection + quick log helper

**Files:**
- Create: `src/lib/quickLog.ts`, `src/lib/quickLog.test.ts`
- Modify: `src/lib/firebase.ts` (`Table` += `"day_reviews"`, `type DayReview = { id: string; updated_at: string; closed: string[] }`), `firestore.rules`, `tests/rules/data.test.ts`, `src/lib/fullExport.ts` (+ test, LEIA_ME), `src/sheets/FoodSheet.tsx` (the `save()` field building moves to `mealFields`)

**Interfaces:**
- Produces:
  - `mealFields(items: FoodItem[], at: string, place: Place, source: "ai" | "manual", photo_path: string | null)`: returns the Firestore fields object FoodSheet writes today (description join and slice to 600, or `mealName`; the rounded sums; the kcal sum). FoodSheet's `save()` uses it.
  - `copyMeal(m: Meal, at: string): Promise<string>`: `addDoc` of `mealFields(m.items!, at, m.place ?? "casa", m.source, null)` + `created_at`. Returns the new id.
  - `closeInReview(day: string, key: string): Promise<void>`: `setDoc(row("day_reviews", day), { updated_at, closed: arrayUnion(key) }, { merge: true })`.
  - `loadReview(day: string): Promise<string[]>`.

The rule `match /day_reviews/{day}`:
- read, delete: `owner(uid)`.
- create, update: `owner(uid) && day.matches('^\\d{4}-\\d{2}-\\d{2}$') && keys hasOnly ['updated_at','closed'] && iso(updated_at) && closed is list && closed.size() <= 40`.

- [ ] **Step 1: Failing tests:**
  - `mealFields` on two items (200 + 150 kcal, protein 10.04 + 2) → `kcal 350`, `protein_g 12`, description `"A, B"`.
  - An empty-description fallback uses `mealName`.
  - Rules: a valid review → succeeds. These fail: day "2026-1-1", 41 entries, an extra key, bob reading it.
- [ ] **Step 2: Run** `npm test` and `npm run test:rules`. Expected: FAIL.
- [ ] **Step 3: Implement.** Add `"day_reviews"` to `FULL_COLLECTIONS` and to LEIA_ME.
- [ ] **Step 4: Run** `npm run check` and `npm run test:rules`. Expected: PASS.
- [ ] **Step 5: Commit** `Revisão do dia: coleção day_reviews e registro rápido`.

### Task C3: SnackSheet

**Files:**
- Create: `src/sheets/SnackSheet.tsx`
- Modify: `src/sheets/FoodSheet.tsx` (prop `at?: Date`: when set, it's the initial time), `src/styles.css` (`.toast`)

**Interfaces:**
- Consumes: `snackChips`, `midpoint`, `copyMeal`, `recipeFood`. Also `deleteDoc(row("meals", id))` for undo.
- Produces: `<SnackSheet profile from={iso} to={iso} onClose onSaved onOther={(at: Date) => void} />`.

Behavior:
- **Title:** "Beliscou algo?", with the eyebrow `entre 12:30 e 16:05`.
- **Time pill:** defaults to `midpoint(from, to)` and is editable (datetime-local).
- **Chips:** `snackChips` of the last 8 weeks (`getDocs` of meals with `eaten_at >= now - 56 days`, `orderBy desc`, `limit 400`), plus recipes (logged at their first portion). If there are fewer than 3 chips, add the FoodSheet "Frequentes" logic's top items. Then "Outro…" and "Nada".
- **Tapping a chip** → `copyMeal` at the pill time. For recipes, a one-item meal via `mealFields`. Then:
  - A toast "Registrado · Desfazer" for 5 s. Desfazer deletes the meal.
  - Then `onSaved()`.
- **"Outro…"** → `onOther(new Date(pill))`. **"Nada"** → `onClose()`.

- [ ] **Step 1:** Implement.
- [ ] **Step 2: Verify.** Run `npm run check`. Expected: PASS. In the browser, open `/?registrar=lanche&de=…&ate=…` (wired in C5): tap "Iogurte, granola", and the meal appears at the midpoint. Desfazer removes it.
- [ ] **Step 3: Commit** `Folha de lanche: um toque registra`.

### Task C4: CloseDaySheet

**Files:**
- Create: `src/sheets/CloseDaySheet.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes:
  - C1 (`findGaps`, `missingSlots`, `snackChips`, `slotChips`, `midpoint`) and C2 (`copyMeal`, `closeInReview`, `loadReview`).
  - `loadRange`, `splitByDay`, `totals` from data.ts.
  - `containersOf` (B3).
  - `backfillAt` from time.ts.
- Produces: `<CloseDaySheet profile day={Date} onClose onSaved />`.

Behavior:
- **Title** "Fechar o dia", with the eyebrow `fmtDayLong(day)`.
- **Loads:** the day's data, the review, and 8 weeks of history (as in C3).
- **Rows, in time order:**
  - Logged meals (read-only: time, description, kcal).
  - Each open `MissingSlot`, as "Café da manhã?" + `slotChips` + "Nada".
  - Each open `Gap`, as `Nada entre 12:30 e 20:10. Beliscou algo?` + snack chips + "Nada".
  - "Open" = its key isn't in `closed`, and (for gaps) no meal now falls inside it.
- **Chip tap:** `copyMeal(meal, at)`, where `at` = `MissingSlot.at` or the gap midpoint. Then `closeInReview(day, key)`, refresh, and the toast with Desfazer.
- **"Nada":** `closeInReview(day, key)`, and the row hides.
- **Water:** the container buttons from `containersOf(profile)`. They add `water` at `isToday ? now : backfillAt(day, now)`, using the same `addDoc` shape as WaterSheet. A line shows `fluidLabel` of the day's totals.
- **"Pronto"** → `onClose()`. With no rows to answer, a line reads "Nada pendente neste dia." No scores, no streak copy.

- [ ] **Step 1:** Implement.
- [ ] **Step 2: Verify.** Run `npm run check`. Expected: PASS. With seeded data, open the review for a day with a gap: tap a chip and the meal lands at the midpoint; "Nada" persists after reopening.
- [ ] **Step 3: Commit** `Fechar o dia: refeições faltando, intervalos e água`.

### Task C5: Entry points (URL params, Hoje button, service worker)

**Files:**
- Create: `src/lib/deepLink.ts`, `src/lib/deepLink.test.ts`
- Modify: `src/App.tsx`, `src/screens/Today.tsx`, `public/sw.js` (bump `CACHE` to `yune-v4`)

**Interfaces:**
- Produces:
  - `type DeepLink = { kind: "snack"; from: string; to: string } | { kind: "review"; day: string } | null`
  - `parseDeepLink(search: string): DeepLink`: `?registrar=lanche&de=<iso>&ate=<iso>` (both valid ISO, de < ate) and `?fechar=AAAA-MM-DD`. Anything else is null.
  - `withoutDeepLink(href: string): string`: strips `registrar`, `de`, `ate` and `fechar`.

Behavior:
- **App** reads `parseDeepLink(location.search)` on mount and on `popstate`, opens `SnackSheet` / `CloseDaySheet`, then `history.replaceState(null, "", withoutDeepLink(location.href))`. SheetKind gains `"snack" | "review"`.
- **`SnackSheet` "Outro…"** opens FoodSheet with `at`.
- **Today:** a `.btn ghost` "Fechar o dia" sits under the instruments when `!isToday || new Date().getHours() >= 19`, calling `onCloseDay(day)`.
- **sw.js:**
  - `showNotification` passes `actions: data.actions ?? []`.
  - `notificationclick`: if `e.action === "nada"`, just close. Otherwise, for an existing client, `c.navigate(target).then((w) => (w ?? c).focus())`, falling back to `c.focus()` if navigate rejects; else `openWindow(target)`.

- [ ] **Step 1: Failing tests:**
  - `parseDeepLink("?registrar=lanche&de=2026-10-27T15:30:00.000Z&ate=2026-10-27T19:05:00.000Z")` → snack.
  - `parseDeepLink("?fechar=2026-10-27")` → review.
  - `?fechar=27-10-2026`, `de` after `ate`, and `?registrar=almoco` → null.
  - `withoutDeepLink("https://x/?fechar=2026-10-27&pro=ok")` → `"https://x/?pro=ok"`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run check`. Expected: PASS. In the browser, both URLs open their sheets and the URL is cleaned. The Hoje button shows on a past day.
- [ ] **Step 5: Commit** `Fechar o dia e lanche abrem pelo link, pela notificação e por Hoje`.

### Task C6: Server gap nudge + summary link + settings toggle

**Files:**
- Modify:
  - `functions/src/reminderStep.ts` (+ test) and `functions/src/sendReminders.ts`;
  - `src/lib/defaults.ts` (`gap_enabled: true`) and `src/lib/firebase.ts` (`Reminders.gap_enabled: boolean`);
  - `firestore.rules` (`validReminders` keys += `'gap_enabled','last_gap_at','gap_count_date','gap_count'`; `gap_enabled` optional bool; `keptOrAbsent` for the three server fields) and `tests/rules/profile.test.ts` (or wherever the reminders rules are tested);
  - `src/screens/Settings.tsx` (Toggle "Perguntar sobre lanches", with the note "Se passar 4 horas sem nada registrado, o Yune pergunta. No máximo duas vezes por dia.");
  - `functions/src/parity.test.ts` if it checks the DEFAULT_REMINDERS keys.

**Interfaces:**
- Produces:
  - `Reminders` += `gap_enabled?: boolean; last_gap_at?: string | null; gap_count_date?: string | null; gap_count?: number`.
  - `Payload` += `url?: string; actions?: { action: string; title: string }[]`.
  - `Deps` += `lastMealAt(uid: string): Promise<string | null>` (the newest `eaten_at`) and `sleepingNow(uid: string): Promise<boolean>` (a sleep doc with `wake_at == null` and `bed_at` within 20 h).
  - `slotPhrase(localMinutes: number): string` → "desde o café da manhã" | "desde o almoço" | "desde o lanche" | "desde o jantar" | "desde a ceia", using the Global Constraints slot boundaries.

The gap nudge step, after the water step:
```
if (r.gap_enabled !== false && inWindow && !(await d.sleepingNow(uid))) {
  windowStart = today's local water_start as an instant (helper from reminderTime: localNow gives date+minutes; build via the existing tz helpers)
  last = await d.lastMealAt(uid)
  gapStart = max(last, windowStart)
  count = r.gap_count_date === local.date ? r.gap_count ?? 0 : 0
  if (now - gapStart >= 4h && count < 2 && (!r.last_gap_at || r.last_gap_at < gapStart)) {
    title = last && last >= windowStart ? `Beliscou algo ${slotPhrase(minutes of last in tz)}?` : "Beliscou algo hoje?"
    send({ title, body: "Um toque registra.", tag: "gap", url: `/?registrar=lanche&de=${gapStart}&ate=${now}`,
           actions: [{ action: "nada", title: "Nada" }, { action: "registrar", title: "Registrar" }] })
    patch({ last_gap_at: now, gap_count_date: local.date, gap_count: count + 1 })
  }
}
```

Two more changes:
- The summary payload gets `url: \`/?fechar=${local.date}\``.
- In `sendReminders.push`, the payload is sent as `{ url: "/", ...payload }`, so the payload's url wins.

- [ ] **Step 1: Failing tests** in `reminderStep.test.ts`, with a fixed clock of 16:05 São Paulo, window 09:00–21:00, and `lastMealAt` = 12:30 the same day:
  - It sends `{ title: "Beliscou algo desde o almoço?", body: "Um toque registra.", tag: "gap", url: "/?registrar=lanche&de=<12:30Z>&ate=<now>", actions: [...] }` and patches `gap_count: 1`.
  - It doesn't send when `last_gap_at` ≥ gapStart (the same gap twice).
  - It doesn't send when `gap_count_date` is today and `gap_count` is 2.
  - It doesn't send when `sleepingNow` is true, when `gap_enabled: false`, when it's outside the window, or when the last meal was at 13:00 (only 3 h 05 min).
  - It sends when `gap_enabled` is absent (old docs).
  - With no meal today (last = yesterday 20:00) at 13:05 → "Beliscou algo hoje?" with de = 09:00 local.
  - The title never contains a digit, even with `push_details: true`.
  - The summary payload has `url: "/?fechar=<date>"`.
  - Rules: the app writing `gap_enabled: false` succeeds; the app changing `gap_count` fails.
- [ ] **Step 2: Run** `npm --prefix functions test` and `npm run test:rules`. Expected: FAIL.
- [ ] **Step 3: Implement.** Wire `lastMealAt` and `sleepingNow` in `sendReminders.ts` with Firestore queries (`meals orderBy eaten_at desc limit 1`; `sleep where wake_at == null`, then filter by `bed_at`).
- [ ] **Step 4: Run** `npm run check`, `npm run build` and `npm run test:rules`. Expected: PASS.
- [ ] **Step 5: Update CLAUDE.md** (bullet: gap nudge rules, `day_reviews`, the deep links, `Fechar o dia`). Commit `Lembrete de lanche e resumo que abre Fechar o dia`. Push and open PR 3 against `claude/easier-logging-water`.
