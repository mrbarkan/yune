# Registrar com menos esforço: design

Date: 2026-10-28 · Status: draft for the product owner (open questions answered in chat). The calls marked *(my call)* are the builder's and can be revisited.

## Why

The product owner tested the app and stopped logging during the day. Most users will too. There are three leaks:

1. **Complex or repeated meals take too long to log.** The real example was "1,5 ovos mexidos na manteiga sem sal, pão de forma integral Artesano Pullman, shake de leite semidesnatado com uma banana, Nescau normal e Nescau 60% aveia, um copo". The shake was made as 500 ml and only 200 ml was drunk. The app can't express "I made a batch and had part of it": the plate stepper moves in 0.5 steps, per item.
2. **Water takes thought.** The four buttons are bare numbers, not the person's real bottle and cups. Drinks logged with meals (coffee, juice, the shake) don't count toward water at all.
3. **Snacks are forgotten.** In the product owner's words, in the moment a person will "not think about it". Catching up later means remembering, searching and fixing times, and it's tedious.

The product owner's decisions:
- Repeating meals "would solve a big chunk", because most days repeat the same meals.
- Every drink counts toward the water goal, but the glass shows plain water separately.
- Both a gap nudge during the day and a night review.
- **Everything here is free.** It's meant to make the app attractive, so nothing goes behind `FEATURES` / Pro.

## Goals

### 1. Receitas, and Repetir in another size

- **Save a preparation once, log a portion with one tap.** A recipe (`receita`) is a list of ingredients (the same `FoodItem` shape as `meals.items`, with `grams`) plus how much it makes (`rende`): an amount and a unit, which is `ml`, `g` or `porções`.
- **Logging a recipe adds one plate item.** For example "Shake de banana · 200 ml": its nutrition is the sum of the ingredients × (portion / yield). It's saved in `meals.items` as one item, with `grams` = the portion (for `ml` recipes, 1 ml ≈ 1 g *(my call)*) and an optional `recipe_id`.
- **Create it from the plate, at the moment of the problem.** With two or more items on the plate, a "Fiz mais do que comi" action opens a small dialog:
  - **The plate's items as checkboxes, all unchecked**, so the person ticks the ones that went into the batch *(my call)*. In the real case the plate also holds the eggs and the bread, which must stay outside the shake.
  - "Rendeu" (500 ml), with a unit picker.
  - "Comi/tomei" (200 ml).
  It saves the recipe (name suggested from the ticked items, editable) and replaces only the ticked items on the plate with the single portion item. Everything else on the plate stays as it was. The person's real case gets solved the first time, not only the second.
- For `porções` recipes, `grams` on the logged item is the total ingredient weight ÷ the number of portions × the portions eaten *(my call)*.
- **Recipes everywhere food is found.**
  - In search (a new source `"receita"`, ranked with the person's own items).
  - In Frequentes.
  - In the snack chips (Part 3).
  - Portion chips come from the yield: for `ml`, a "copo (200 ml)" and "metade"; for `porções`, "1 porção". The existing "pesei" field takes ml or g.
- **Manage them in Ajustes › Minhas receitas** *(my call: Ajustes already holds the per-person lists)*. You can rename, change the yield and delete. "Editar ingredientes" reopens the ingredients in the plate editor and saves back to the recipe. Editing a recipe never changes meals already logged, because meals keep their own copy of the numbers.
- **Repetir in another size.** When a plate has more than one item, a plate-wide size row appears above it ("½ · ¾ · 1 · 1½ · 2"). It scales every item at once, so "the usual lunch, smaller" is two taps. The existing per-item steppers stay as they are.

### 2. Water: real containers, and every drink counts

- **Named containers.** The four bare sizes become up to six containers, each a name plus ml: "Garrafa · 750", "Copo de casa · 300", "Caneca do trabalho · 350". They live on the profile as `water_containers: { name, ml }[]`. If it's absent, they come from `water_sizes` (or `DEFAULT_WATER_SIZES`) named "Copo" *(my call)*. "Ajustar copos" becomes "Meus recipientes", where you can add, rename, delete and reorder.
- **Bottles.** Tapping a container logs it whole, at the current time (or the chosen backfill time, as now). Each container also has a small "½" button, so nobody has to wait for the bottle to be empty.
- **Drinks from meals count.**
  - **Which items count:**
    - TACO group 8 (beverages).
    - Common/supplement items marked as drinks.
    - `ml` recipes.
    - Anything whose name matches the drink patterns already in `foods.ts` (suco, refrigerante, café, chá, leite, água de coco, bebida, shake, vitamina, isotônico).
  - **Alcohol never counts:** cerveja, vinho, aguardente/cachaça, destilados, drinks.
  - **Storage:** one helper, `drinkMl(item)` in `src/lib/foods.ts`, decides at save time, and the result is stored as an optional `ml` on the item. Old meals without `ml` don't count, so no data is rewritten *(my call)*.
  - **AI items** go through the same name check.
  - **The plate shows a small "conta como 200 ml de líquido" line**, so the person can see it working.
- **One total everywhere.** Today's instrument, the water sheet, Semana, the 21:30 summary and the water reminder all use water + drinks. The water reminder doesn't fire if a drink was logged in the interval.
- **The glass shows two layers.** Plain water is the solid water colour. Other drinks sit above it in a lighter tint of the same colour. The label reads "1,6 L · 1,1 L de água", with the second part only shown when they differ.
- The goal is still `water_goal_ml`.

### 3. Lembrete de intervalo, and Fechar o dia

**The gap nudge** runs inside `sendReminders` / `processUser`, as a new step:
- **When it fires:**
  - No meal has been logged for 4 h *(my call)*. Plain `water` entries don't count, otherwise anyone following the 2 h water reminder would never see a gap. Drinks logged as meals do count, since they're meals. The same rule applies to the gaps in Fechar o dia.
  - The current time is inside the person's waking window. That's `water_start`–`water_end`, the existing "awake" hours *(my call; there are no new settings to learn)*.
  - There's no open sleep log.
  - At most 2 a day, and never for the same gap twice.
- **New reminder fields:** `gap_enabled` (default true), and `last_gap_at` / `gap_count_date` / `gap_count` for the limits.
- **The text:**
  - Title "Beliscou algo desde o almoço?". It names the last meal slot ("desde o café da manhã"), or "hoje" if there's no meal yet.
  - Body "Um toque registra." It never shows numbers, whatever `push_details` says.
- **Buttons** (`actions` in `sw.js`):
  - "Nada" just closes it. The service worker can't write to Firestore, and the server already won't repeat that gap. **The same gap still shows in Fechar o dia that night.** The product owner accepted this: a person may have dismissed the notification by mistake, and the night review is the second chance.
  - "Registrar" opens `/?registrar=lanche&de=<iso>&ate=<iso>`.
  - On platforms without buttons (iPhone), a tap opens the same link.

**The snack sheet**, which "Registrar" opens:
- It shows the person's usual snacks as chips:
  - **Whole past snacks**, not single items *(my call)*: meals logged in the snack slots ("Lanche", "Ceia", per `mealName`) in the last 8 weeks, grouped by description and ranked by frequency. A chip like "Iogurte, granola" saves both items. Picking single items would fill the chips with pieces of lunches.
  - Recipes.
  - "Outro…", which opens the full meal sheet.
  - "Nada".
- **One tap on a chip saves straight away**, with no plate step. It uses the usual portion, at the middle of the gap *(my call: the time stays editable)*.
- A "Desfazer" toast follows.

**Fechar o dia** is a sheet:
- **How it opens:**
  - From the 21:30 summary push (its link becomes `/?fechar=<AAAA-MM-DD>`).
  - From a "Fechar o dia" button on Hoje after 19:00, or on any earlier day being viewed.
- **What it shows:**
  - **The day's log**, read-only, in order.
  - **Missing main meals:** if nothing was logged in the Café da manhã / Almoço / Jantar time slots, a row like "Café da manhã?" shows that slot's Repetir chips from past days. A forgotten whole day becomes three taps.
  - **Gaps** of 4 h or more inside the waking window, each with the snack chips and "Nada".
  - **Water:** the container buttons, logged at the review time (or a backfill time for past days), as the water sheet does now.
- **"Nada" and answered gaps persist** in `users/{uid}/day_reviews/{AAAA-MM-DD}` = `{ updated_at, closed: string[] }`, where each entry is the ISO start of a closed gap or slot. Anything logged inside a gap also closes it.
- "Pronto" just closes the sheet. There's no score and no streak.
- **Settings:** Ajustes › Lembretes gets "Perguntar sobre lanches" (`gap_enabled`). The summary toggle already exists.

## Non-goals

- Voice logging, barcode scanning, and wearable or health-app integration.
- Guessing meals from location or the calendar.
- Changing old meals to count their drinks.
- Recipes shared between people.
- Sleep and movement catch-up in Fechar o dia (these leaks didn't come up).

## Anti-goals (failure even if it works)

- **Nagging.** Never more than 2 gap nudges a day, plus the existing reminders. Nothing at night or while asleep.
- **Soda quietly filling the water glass.** The split must always be visible when drinks are counted.
- **Making catch-up feel like homework.** Fechar o dia has no guilt copy, no streaks, and everything in it is optional.
- **More taps than today.** Every new path has to be shorter than the existing one for the same result.

## Constraints

- **All UI text in pt-BR.** Style follows `src/styles.css` tokens; the second glass layer is a tint of `--water`, not a new pigment.
- **Firestore rules:**
  - New `recipes/{id}` and `day_reviews/{day}` under `users/{uid}`, owner-only, validated like `custom_foods`. Both fall under the `deleting/{uid}` lock through `owner()`.
  - `validProfile` accepts `water_containers` (at most 6, name 1–40 chars, ml 10–3000).
  - Meal `items` keep the size limit; the new item fields `ml` and `recipe_id` are optional.
  - Rules tests are needed for each.
- **Data rights:**
  - `recipes` and `day_reviews` go into `FULL_EXPORT` (`src/lib/fullExport.ts`) and `LEIA-ME.txt`.
  - `deleteAccount` already deletes `users/{uid}` recursively.
  - The Excel export's water column becomes water + drinks, with a separate "Água pura" column *(my call)*.
- **`estimateFood` doesn't change.** Drink detection happens in the app.
- **Tests:** unit tests for recipe scaling, `drinkMl`, gap and missing-slot detection, and the new `processUser` step (via its injected deps), plus rules tests. `npm run check` and `npm run test:rules` must pass.
- **CLAUDE.md** gets a short entry for each of the three parts.

## Order of work

These are three separate PRs, in this order, because the later parts reuse the earlier ones:
1. Receitas + Repetir in another size.
2. Water containers + drinks counting.
3. Gap nudge + snack sheet + Fechar o dia.

## Left to the builder

- Layout details inside the existing visual system, and wording beyond the strings given here.
- How snack chips are ranked when there's little history (fall back to Frequentes).
- Exact drink regex list and the TACO/common/supplement flags.
- Whether "Fiz mais do que comi" sits on the plate or behind the plate's menu, as long as it's reachable in one tap from a plate with 2+ items.
