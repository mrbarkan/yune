# CLAUDE.md — Yune

PWA de diário de saúde (comida, movimento, água, sono). Todo texto de interface em pt-BR.

- `npm run dev` (porta 8080) · `npm run build` (inclui `tsc --noEmit`)
- Frontend: React + Vite, CSS próprio em `src/styles.css` (tokens em `:root`, tema escuro via `prefers-color-scheme`).
- `src/components/Dial.tsx` é o mostrador de 24h usado em Hoje (grande) e Semana (pequeno, `minimal`).
- Backend: Firebase (`src/lib/firebase.ts`). Registros em `users/{uid}/{meals|activities|water|sleep|custom_foods|push_subscriptions}`,
  perfil em `users/{uid}`, lembretes em `reminders/{uid}`. Datas são strings ISO em UTC. Regras em `firestore.rules` / `storage.rules`.
- Cloud Functions em `functions/src` (Node 22): `estimateFood` é callable e devolve sempre um objeto (resultado ou `{ error }`).
- Sono pertence ao dia em que se acorda; registro aberto (`wake_at` nulo) = dormindo agora.
- Push: `public/sw.js` recebe; `functions/src/sendReminders.ts` envia (Web Push/VAPID, agendada a cada 5 min); `reminders.push_details` (padrão false): sem números na tela bloqueada.
- Comida: busca local primeiro (`src/lib/foods.ts`: TACO em `src/data/taco.json`, itens do dia a dia que a TACO não tem em
  `src/data/common.json`, suplementos em `src/data/supplements.json`,
  itens próprios em `custom_foods`, histórico em `meals.items`). IA (`estimateFood`, Claude Haiku) só para texto livre, foto do prato e rótulo.
- `meals.items[]` guarda `grams` por item — é o que permite reusar itens do histórico como atalhos.
- Dieta prescrita (Pro): o app envia o arquivo para `diet-plans/{uid}/` no Storage (ou o texto colado) e chama `importDietPlan`,
  que grava o plano em `users/{uid}/diet_plans` (a nova substitui e apaga as anteriores, em `functions/src/dietReplace.ts`; o app só liga/desliga e apaga). Avisos e "Pela dieta" em `src/lib/diet.ts`.
- Consentimento da IA: `users/{uid}.ai_consent = { at, version }` (ou ausente/null). `AI_CONSENT_VERSION` igual em `src/lib/consent.ts` e `functions/src/consent.ts`
  (teste de paridade). `estimateFood`, `importDietPlan` e `readHealthDoc` chamam `checkAiConsent` logo após o login e devolvem `{ error, consent: "required" }`.
  No app, `useAiConsent` (`src/lib/useAiConsent.tsx`) envolve cada ação de IA em `ask(...)`; liga/desliga em Ajustes › Leitura por IA.
- Pro: `entitlements/{uid}` só o servidor escreve. Recursos pagos em `FEATURES` (`src/lib/pro.ts`); no beta `PRO_OPEN = true`
  em `src/lib/pro.ts` e `functions/src/pro.ts` (mudar os dois juntos).
- Perfil da paciente (subcoleções de `users/{uid}`): `measurements` (peso/cintura/quadril/pescoço, `created_at` obrigatório), `body_comp` e `lab_reports`
  (só leitura/apagar pelo app; o servidor grava), `body_photos`, `anamnesis/{AAAA-MM-DD}` (`{ updated_at, answers }`, chaves de `SECTIONS` em
  `src/lib/anamnesis.ts`; mesmo dia sobrescreve, outro dia cria versão). Storage: `profile-photos/{uid}`, `body-photos/{uid}/…`, `health-docs/{uid}/…`.
- Baixar meus dados (grátis): `src/lib/fullExport.ts` monta o .zip no aparelho (fflate; `dados.json` + `LEIA-ME.txt` + originais do Storage via `getBlob`, em `arquivos/`). Fotos do corpo só se a pessoa marcar; `push_subscriptions` nunca entra.
- Bioimpedância e exames (Pro): o app envia a foto/PDF para `health-docs/{uid}/`, chama `readHealthDoc` (devolve rascunho para conferir; nada é salvo)
  e depois `saveHealthDoc` (valida e grava em `body_comp` / `lab_reports`). Catálogo de exames em `src/data/labs.json` = `functions/src/labCodes.ts`.
- Stripe (cartão, BRL): functions `createCheckout`, `createPortal`, `getProPrices`, `stripeWebhook` (`functions/src/billing.ts`). Segredos
  `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET` (`firebase functions:secrets:set`); parâmetro `APP_URL` (URL do app, sem barra final).
  Preços por lookup key `yune_pro_monthly` / `yune_pro_annual`. Webhook: endpoint = URL da função `stripeWebhook` (southamerica-east1), eventos
  `customer.subscription.created|updated|deleted`, `invoice.paid` e `invoice.payment_failed`. Só cartão, via `allowed_payment_method_types: ["card"]` no Checkout (nunca `payment_method_types`).
  No painel da Stripe configurar: Checkout "limitar clientes a uma assinatura" e "cancelar a assinatura se todas as novas tentativas falharem".
- `entitlements/{uid}` = `{ pro, until, source, beta_until, stripe }`: `beta_until` (script) e `stripe` (webhook) ficam separados e
  `deriveEntitlement` (`functions/src/entitlement.ts`) deriva `pro/until/source`. `billing/{uid}` (customer, assinatura, `trial_used`) é só do servidor:
  as regras negam tudo ao app.
- Storage CORS (para `getBlob` das fotos privadas): `gcloud storage buckets update gs://<bucket> --cors-file=storage.cors.json`.
- Emuladores (projeto `demo-yune`; auth 9099, firestore 8085, storage 9199, functions 5001): `npm run emulators` (compila as functions antes) e
  `npm run dev:emu` (app apontando para eles). O emulador de functions pede `APP_URL`: criar `functions/.env.local` com `APP_URL=http://localhost:8080` (gitignored).
  Sem `functions/.secret.local` ele loga um ERRO do Secret Manager para `STRIPE_SECRET_KEY`: esperado, a cobrança simulada continua funcionando.
  Dados persistidos (`--import`/`--export-on-exit`) podem guardar um `entitlements.stripe` simulado que depois bloqueia um checkout real
  ("Você já tem o Pro."): limpar ao trocar para chaves de teste reais da Stripe.
  Testes: `npm run check` (tipos + todos os testes unitários), `npm run test:rules` (regras, sobe emuladores). Webhook local:
  `stripe listen --forward-to http://127.0.0.1:5001/demo-yune/southamerica-east1/stripeWebhook` (o `whsec_` impresso vai em `STRIPE_WEBHOOK_SECRET`).
- Cobrança simulada: no emulador (projeto `demo-*`) sem `STRIPE_SECRET_KEY` em `functions/.secret.local`, `getProPrices` / `createCheckout` / `createPortal`
  simulam (R$ 19,90 / R$ 199,00; teste pela regra `trialFor`). O webhook não muda. Nunca liga em produção (`mockBillingEnabled`).
- Passeio no navegador com Pro fechado: trocar `PRO_OPEN` para `false` nos dois arquivos **só localmente**, nunca commitar (o teste de paridade exige os dois iguais).
- Seed (só emulador, recusa sem `FIRESTORE_EMULATOR_HOST`): `npm run seed:emu` com os emuladores no ar. Cria `paciente@yune.test`
  (senha no topo de `functions/scripts/seed.ts`) com 8 semanas de dados.
- Beta: `npm --prefix functions run grant-beta -- --days 30 --apply [--project <id>]` grava `beta_until` de todos (pula quem já tem beta mais longo;
  mantém `stripe`). `--apply` é obrigatório para gravar; sem ele é só simulação (dry-run). `--days` de 1 a 90. Fora do emulador exige `--project`.
  Encerrar o beta = rodar o grant-beta (para dar o prazo final) e, num mesmo release, pôr `PRO_OPEN = false` em `src/lib/pro.ts` e `functions/src/pro.ts`.
- Apagar conta (`deleteAccount`, callable com `STRIPE_SECRET_KEY`): exige `confirm: "APAGAR"` e login recente (`auth_time` até 10 min; senha: o app reautentica logo antes; Google/Apple: login recente ou popup; o servidor decide).
  Ordem: apaga o customer na Stripe (cancela as assinaturas na hora; se falhar, nada mais é apagado), depois arquivos em `STORAGE_PREFIXES` (`meal-photos`, `profile-photos`, `body-photos`, `health-docs`, `diet-plans`
  com `/{uid}/`), `users/{uid}` (recursivo), `reminders`, `entitlements`, `billing`, `ai_usage` e por fim o usuário do Auth. No modo de cobrança simulada o `deleteCustomer` é no-op.
  Depois de apagar, o webhook registra "customer sem uid" nos eventos `subscription.deleted` do customer removido: esperado.
