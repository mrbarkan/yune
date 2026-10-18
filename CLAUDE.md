# CLAUDE.md — Yune

PWA de diário de saúde (comida, movimento, água, sono). Todo texto de interface em pt-BR.

- `npm run dev` (porta 8080) · `npm run build` (inclui `tsc --noEmit`)
- Frontend: React + Vite, CSS próprio em `src/styles.css` (tokens em `:root`, tema escuro via `prefers-color-scheme`).
- `src/components/Dial.tsx` é o mostrador de 24h usado em Hoje (grande) e Semana (pequeno, `minimal`).
- Backend: Firebase (`src/lib/firebase.ts`). Registros em `users/{uid}/{meals|activities|water|sleep|custom_foods|push_subscriptions}`,
  perfil em `users/{uid}`, lembretes em `reminders/{uid}`. Datas são strings ISO em UTC. Regras em `firestore.rules` / `storage.rules`.
- Cloud Functions em `functions/src` (Node 22): `estimateFood` é callable e devolve sempre um objeto (resultado ou `{ error }`).
- Sono pertence ao dia em que se acorda; registro aberto (`wake_at` nulo) = dormindo agora.
- Push: `public/sw.js` recebe; `functions/src/sendReminders.ts` envia (Web Push/VAPID, agendada a cada 5 min).
- Comida: busca local primeiro (`src/lib/foods.ts`: TACO em `src/data/taco.json`, suplementos em `src/data/supplements.json`,
  itens próprios em `custom_foods`, histórico em `meals.items`). IA (`estimateFood`, Claude Haiku) só para texto livre, foto do prato e rótulo.
- `meals.items[]` guarda `grams` por item — é o que permite reusar itens do histórico como atalhos.
