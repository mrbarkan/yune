# CLAUDE.md — Yune

PWA de diário de saúde (comida, movimento, água, sono). Todo texto de interface em pt-BR.

- `npm run dev` (porta 8080) · `npm run build` (inclui `tsc --noEmit`)
- Frontend: React + Vite, CSS próprio em `src/styles.css` (tokens em `:root`, tema escuro via `prefers-color-scheme`).
- `src/components/Dial.tsx` é o mostrador de 24h usado em Hoje (grande) e Semana (pequeno, `minimal`).
- Backend: Supabase. Esquema em `supabase/migrations`, RLS em tudo. Edge functions retornam 200 com `{ error }`.
- Sono pertence ao dia em que se acorda; registro aberto (`wake_at` nulo) = dormindo agora.
- Push: `public/sw.js` recebe; `supabase/functions/send-reminders` envia (pg_cron a cada 5 min).
