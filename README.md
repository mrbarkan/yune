# Yune

Comida, movimento, água e sono — o seu dia num só mostrador.

Yune é um web app instalável (PWA) para iPhone e Android. Cada dia aparece como um relógio de 24 horas:
o arco violeta é o sono, os traços azuis são o movimento, os pontos vermelhos são as refeições
(o tamanho acompanha as calorias) e os riscos ciano são os copos d'água. No centro, quantas calorias faltam
para a meta do dia.

- **Comida** — descreva em português ("arroz, feijão, bife acebolado e salada") e o Claude estima as calorias
  e macros de cada item (referência Tabela TACO). Dá para corrigir o número ou repetir refeições recentes com um toque.
- **Movimento** — escolha a atividade, a duração e a intensidade; o gasto é estimado por METs e o seu peso
  (ou digite o número do relógio).
- **Água** — botões de +150/250/350/500 ml.
- **Sono** — "Vou dormir agora" / "Acordei", ou registre os horários depois.
- **Semana** — sete mostradores lado a lado, calorias por dia e médias.
- **Notificações** — lembrete de água, hora de dormir e resumo do fim do dia ("Seu dia: 1.640 kcal líquidas…").

## Notificações no iPhone e no Android

| | Android (Chrome) | iPhone (iOS 16.4+) |
|---|---|---|
| Push | Funciona no navegador ou instalado | **Só com o app na Tela de Início** |
| Como instalar | Menu ⋮ → *Instalar app* | Safari → Compartilhar → *Adicionar à Tela de Início* |

Depois de instalado, abra o Yune pelo ícone → Ajustes → *Receber notificações neste aparelho*.
Os lembretes são enviados pelo servidor (Web Push), então chegam mesmo com o app fechado.

## Stack

- React + TypeScript + Vite, CSS próprio (sem framework de UI)
- Supabase: Auth (e-mail e senha), Postgres com RLS em todas as tabelas, Edge Functions, pg_cron
- Claude API (`estimate-food`) para estimar calorias
- Web Push com chaves VAPID (`send-reminders`)

## Como colocar no ar

### 1. Supabase

Crie um projeto em [supabase.com](https://supabase.com) e, nesta pasta:

```bash
npx supabase login
npx supabase link --project-ref SEU_REF
npx supabase db push
```

Em *Authentication → URL Configuration*, coloque a URL do app (ex.: `https://yune.vercel.app`) como Site URL.
Em *Authentication → Providers → Email*, mantenha a confirmação de e-mail ligada.

### 2. Chaves e segredos

```bash
npx web-push generate-vapid-keys          # gera a chave pública e a privada

npx supabase secrets set \
  ANTHROPIC_API_KEY=sk-ant-... \
  VAPID_PUBLIC_KEY=... \
  VAPID_PRIVATE_KEY=... \
  VAPID_SUBJECT=mailto:voce@email.com \
  CRON_SECRET=$(openssl rand -hex 24)

npx supabase functions deploy estimate-food
npx supabase functions deploy send-reminders
```

### 3. Agendar os lembretes (SQL Editor do Supabase)

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule('yune-reminders', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://SEU_REF.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', 'O_MESMO_CRON_SECRET'),
    body := '{}'::jsonb
  )
$$);
```

### 4. Frontend (Vercel)

Importe o repositório na Vercel e defina as variáveis (veja `.env.example`):

```
VITE_SUPABASE_URL=https://SEU_REF.supabase.co
VITE_SUPABASE_ANON_KEY=...
VITE_VAPID_PUBLIC_KEY=...   # a mesma chave pública do passo 2
```

Para rodar localmente: `cp .env.example .env.local`, preencha e `npm install && npm run dev`.

## Segurança

- Cada tabela tem Row Level Security: cada pessoa só lê e altera os próprios registros.
- A chave da Anthropic e a chave privada VAPID ficam só nos segredos do Supabase, nunca no frontend.
- `estimate-food` exige usuário logado; `send-reminders` só responde ao cron com `x-cron-key`.
- `daily_totals` só pode ser chamada pelo service role.

As estimativas de calorias são aproximadas e não substituem orientação profissional.
