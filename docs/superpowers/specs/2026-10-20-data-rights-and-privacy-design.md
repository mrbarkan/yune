# Direitos sobre os dados e privacidade: design

Date: 2026-10-20 · Status: approved by the product owner in chat ("go ahead with your suggestions"); the calls marked *(my call)* are the builder's and can be revisited.

## Why

Yune holds health data (food, body, labs, photos), which LGPD treats as sensitive. Before Pro is sold and before clinics join, a patient must be able to:
- take a full copy of their data;
- erase everything;
- know and agree before the AI reads their content;
- keep notifications from showing their numbers on a locked phone.

The product owner also chose that importing a new diet erases the old one.

Approved items:
- U-1: an AI consent screen.
- U-2: notifications hide the numbers by default.
- U-3: a new diet deletes the old one.
- U-4: account deletion.
- New requests: "Baixar meus dados" and "Apagar meus dados".

## Goals

1. **Baixar meus dados**, free for everyone, with or without Pro:
   - The download is one `.zip` with `dados.json`, the original files, and a `LEIA-ME.txt`.
   - The original files are meal photos, the profile photo, exam and bioimpedance files, and diet files.
   - Body photos come only if the person ticks "Incluir fotos do corpo", which is off by default *(my call: it keeps the "they never leave the app unless you choose" promise)*.
   - Built in the browser from data the person can already read, so no new server path exposes data.
   - The Excel and PDF exports stay as they are.
2. **Apagar minha conta e meus dados**, free for everyone. A server function deletes:
   - every Firestore document of the person: `users/{uid}` and all its subcollections, plus `reminders/{uid}`, `entitlements/{uid}`, `billing/{uid}` and `ai_usage/{uid}_*`;
   - every Storage file under the person's 5 prefixes;
   - the Auth user.

   If there is a Stripe subscription, it is cancelled immediately and the Stripe customer is deleted first. If that fails, nothing is deleted and an error is shown.

   The function demands the confirmation word `APAGAR` and a sign-in from the last 10 minutes.
   - Email/password users confirm their password inline.
   - Google/Apple users re-authenticate with a popup. If that fails, they are told to sign out and back in *(my call)*.
3. **AI consent (U-1).**
   - Before the first AI use (meal text or photo, nutrition label, diet import, exam or bioimpedance reading), a sheet explains:
     - what is sent: the text, photo or document the person sends;
     - to whom: Anthropic, in the USA, which is an international transfer;
     - why: to estimate or read it;
     - that Anthropic does not use it to train models;
     - that it can be turned off in Ajustes.
   - The buttons are "Concordo" and "Agora não". Manual entry always works without consent.
   - The consent is stored as `users/{uid}.ai_consent = { at: ISO, version: 1 }` and removed when the person turns it off.
   - The server checks the consent too: the AI functions refuse without `ai_consent.version >= 1`.
4. **Private notifications (U-2).**
   - New `reminders.push_details` (default `false`). While it is false:
     - the summary says "Seu resumo do dia está pronto" / "Toque para ver no Yune.";
     - water says "Um copo d'água?" / "Hora de se hidratar.".
   - When true, today's texts with numbers are used.
   - Toggle in Ajustes: "Mostrar números nas notificações".
5. **A new diet replaces the old one (U-3).** After a successful import, the server deletes every other diet document and its file. The Ajustes copy says so.

## Non-goals

- A request queue, admin review or grace period for deletion. Requests run immediately (*my call*). The clinic era (project 2) may add "the clinic keeps its own clinical records", which will need its own legal basis.
- Server-built exports. Very large accounts may stress a phone; this is LATER.
- The legal text of the privacy policy (project 3). The consent copy here is plain and will be reviewed there.
- Signing Anthropic's DPA. This is the product owner's action.

## Anti-goals

- Deleting data and then failing to cancel billing, so the person is charged with no account.
- Any shareable URL to private files in the export or deletion paths.
- A consent wall that blocks manual food entry.

## Constraints

- Everything follows CLAUDE.md:
  - pt-BR UI;
  - callables return a result or `{ error }`;
  - rules stay strict;
  - mock billing in the emulator, where the "cancel" is a no-op that clears `entitlements.stripe`;
  - `PRO_OPEN` stays true.
- Tests come first:
  - pure helpers get unit tests;
  - rules changes get rules tests;
  - the server delete is written with injected dependencies, so it is testable without the emulator.

## Left to the builder

- Layout details inside the existing Ajustes "Seus dados" section.
- File names inside the zip:
  - `arquivos/<pasta>/<nome>`, following the Storage path;
  - the zip itself is named `yune-meus-dados-AAAA-MM-DD.zip`.
