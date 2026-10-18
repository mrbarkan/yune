# Yune

Comida, movimento, água e sono — o seu dia num só mostrador.

Yune é um web app instalável (PWA) para iPhone e Android. Cada dia aparece como um relógio de 24 horas:
o arco violeta é o sono, os traços azuis são o movimento, os pontos vermelhos são as refeições
(o tamanho acompanha as calorias) e os riscos ciano são os copos d'água. No centro, quantas calorias faltam
para a meta do dia.

- **Comida** — feita para digitar o mínimo:
  - busca instantânea e offline em ~500 alimentos da **Tabela TACO** + **31 suplementos** populares
    (Supercoffee, whey, creatina, colágeno, barras, YoPRO…), com medidas caseiras (concha, colher de servir, unidade);
  - atalhos de **Repetir** refeições e itens **Frequentes**; digitar só um número lança as calorias direto;
  - **foto do prato** → a IA identifica os itens e porções;
  - **foto do rótulo** → o produto vira um item seu, salvo para as próximas vezes;
  - descreveu algo que a busca não achou? "Calcular" estima item por item;
  - marca se foi em **casa, restaurante ou delivery** (lembra a última escolha).
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
- Firebase: Authentication (e-mail e senha, com confirmação), Firestore com regras de segurança em todas as coleções,
  Storage, Cloud Functions (2ª geração) e Cloud Scheduler
- Claude Haiku (`estimateFood`) só quando a busca local não resolve: texto livre, foto do prato e leitura de rótulo.
  Limite de 80 chamadas por pessoa por dia.
- Dados: Tabela TACO 4ª ed. (NEPA/Unicamp) via [taco-api](https://github.com/raulfdm/taco-api) (MIT);
  suplementos a partir das tabelas nutricionais publicadas pelos fabricantes e varejistas — confira o rótulo do seu.
- Web Push com chaves VAPID (`sendReminders`)

## Como colocar no ar

### 1. Firebase

Crie um projeto em [console.firebase.google.com](https://console.firebase.google.com) no plano **Blaze**
(Cloud Functions e o agendador exigem faturamento; o uso do Yune cabe na cota gratuita). Depois, no console:

- *Authentication → Método de login*: ative **E-mail/senha**. Em *Configurações → Domínios autorizados*, adicione o domínio do app.
- *Firestore Database*: crie o banco (região `southamerica-east1`, modo de produção).
- *Storage*: ative o bucket padrão.
- *Configurações do projeto → Seus apps*: crie um app da Web e copie a configuração para o `.env.local`.

Nesta pasta:

```bash
npm install -g firebase-tools
firebase login
firebase use --add                      # escolha o projeto
npm --prefix functions install
firebase deploy --only firestore,storage
```

### 2. Chaves e segredos

```bash
npx web-push generate-vapid-keys          # gera a chave pública e a privada

firebase functions:secrets:set ANTHROPIC_API_KEY
firebase functions:secrets:set VAPID_PUBLIC_KEY
firebase functions:secrets:set VAPID_PRIVATE_KEY
firebase functions:secrets:set VAPID_SUBJECT      # ex.: mailto:voce@email.com

firebase deploy --only functions
```

`sendReminders` roda sozinha a cada 5 minutos (o deploy cria o job no Cloud Scheduler).

### 3. Frontend

Defina as variáveis (veja `.env.example`) e publique no Firebase Hosting:

```bash
cp .env.example .env.local   # preencha com a configuração do app da Web e a chave pública VAPID
npm run build
firebase deploy --only hosting
```

(Também funciona na Vercel: importe o repositório e defina as mesmas variáveis `VITE_*`.)

Para rodar localmente: `cp .env.example .env.local`, preencha e `npm install && npm run dev`.

## Segurança

- Regras do Firestore: cada pessoa só lê e altera os próprios registros (`users/{uid}/…`, `reminders/{uid}`),
  e só depois de confirmar o e-mail. As regras também validam tipos e limites de cada campo.
- A chave da Anthropic e a chave privada VAPID ficam só no Secret Manager, nunca no frontend.
- `estimateFood` exige usuário logado com e-mail confirmado; `sendReminders` não tem URL pública (só o agendador a chama).
- `ai_usage` só é acessível pelas Cloud Functions.
- Fotos ficam no Storage em `meal-photos/<uid>/`; cada pessoa só lê e apaga a própria pasta.

As estimativas de calorias são aproximadas e não substituem orientação profissional.
