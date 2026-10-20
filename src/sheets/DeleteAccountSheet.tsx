import { useEffect, useState } from "react";
import {
  EmailAuthProvider, GoogleAuthProvider, OAuthProvider, reauthenticateWithCredential, reauthenticateWithPopup, signOut,
} from "firebase/auth";
import { Sheet } from "@/components/Sheet";
import { auth, deleteAccount } from "@/lib/firebase";
import { disablePushQuietly } from "@/lib/push";

const GONE = "gone";
const REAUTH_FAIL = "Não foi possível confirmar. Saia, entre de novo e volte aqui em até 10 minutos.";

const REAUTH_SECONDS = 600;

/** Mensagem final fora da árvore do React: o signOut troca a tela e desmonta a folha, mas o aviso continua até "Fechar". */
function showDeletedNotice() {
  const box = document.createElement("div");
  box.className = "sheet-backdrop";
  box.innerHTML = `<section class="sheet" role="alertdialog" aria-modal="true" aria-label="Conta apagada"><div class="sheet-grip"></div><div class="sheet-body"><p></p><button class="btn">Fechar</button></div></section>`;
  box.querySelector("p")!.textContent = "Conta apagada. Obrigado por ter usado o Yune.";
  box.querySelector("button")!.addEventListener("click", () => box.remove());
  document.body.appendChild(box);
}

type Method = "password" | "google" | "apple";

const noop = () => {};

function methodOf(): Method {
  const ids = auth.currentUser?.providerData.map((p) => p.providerId) ?? [];
  if (ids.includes("password")) return "password";
  if (ids.includes("apple.com")) return "apple";
  return "google";
}

/** Apaga a conta e tudo o que há nela. Pede a senha (ou confirmação do Google/Apple) e a palavra APAGAR. */
export function DeleteAccountSheet({ onClose }: { onClose: () => void }) {
  const method = methodOf();
  const [pw, setPw] = useState("");
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  // Login recente (até 10 min) vale como confirmado: o popup não funciona no app instalado no iPhone.
  useEffect(() => {
    if (method === "password") return;
    let live = true;
    auth.currentUser?.getIdTokenResult().then((r) => {
      const at = Number(r.claims.auth_time);
      if (live && at > 0 && Date.now() / 1000 - at <= REAUTH_SECONDS) setConfirmed(true);
    }).catch(() => {});
    return () => { live = false; };
  }, [method]);

  const wordOk = word.trim().toUpperCase() === "APAGAR";
  const canRun = wordOk && !busy && (method !== "password" || pw.length > 0);

  async function reauth(): Promise<string | null> {
    const user = auth.currentUser;
    if (!user) return REAUTH_FAIL;
    try {
      if (method === "password") {
        await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email ?? "", pw));
      } else {
        await reauthenticateWithPopup(user, method === "google" ? new GoogleAuthProvider() : new OAuthProvider("apple.com"));
      }
      return null;
    } catch (e) {
      const c = (e as { code?: string }).code;
      // A conta já foi apagada (por exemplo, a resposta anterior se perdeu): não há o que confirmar.
      if (c === "auth/user-not-found") return GONE;
      // Com a proteção contra enumeração de e-mail, conta apagada volta como credencial inválida: confere recarregando.
      if (c === "auth/invalid-credential" || c === "auth/user-mismatch") {
        try { await user.reload(); } catch (r) { if ((r as { code?: string }).code === "auth/user-not-found") return GONE; }
      }
      if (method === "password" && (c === "auth/wrong-password" || c === "auth/invalid-credential")) return "Senha incorreta.";
      return method === "password" ? "Não foi possível confirmar a senha agora. Tente de novo." : REAUTH_FAIL;
    }
  }

  async function finish() {
    try { await disablePushQuietly(); } catch { /* o documento já pode ter sumido */ }
    showDeletedNotice();
    // A conta já não existe: se o signOut falhar, recarregar também sai da sessão.
    await signOut(auth).catch(() => location.reload());
  }

  async function confirmProvider() {
    setBusy(true);
    setErr("");
    try {
      const bad = await reauth();
      if (bad === GONE) await finish();
      else if (bad) setErr(bad);
      else setConfirmed(true);
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    setBusy(true);
    setErr("");
    try {
      if (method === "password") {
        const bad = await reauth();
        if (bad === GONE) { await finish(); return; }
        if (bad) { setErr(bad); return; }
      }
      const res = await deleteAccount();
      if (res.ok) {
        await finish();
        return;
      }
      if (res.reauth) setConfirmed(false);
      setErr(res.error ?? "Não foi possível apagar agora. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title="Apagar minha conta" onClose={busy ? noop : onClose}>
      <p>Isto apaga para sempre seu perfil, seus registros, fotos, exames, dietas e lembretes, e cancela o Pro na hora, sem cobranças futuras. Não dá para desfazer.</p>
      <p className="note">Se quiser guardar uma cópia, use antes “Baixar tudo (.zip)”.</p>
      {method === "password" ? (
        <label className="field"><span>Sua senha</span>
          <input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
      ) : (
        <>
          <button className="btn ghost" disabled={busy || confirmed} onClick={confirmProvider}>
            {confirmed ? "Acesso confirmado" : `Confirmar com ${method === "google" ? "Google" : "Apple"}`}
          </button>
          {!confirmed && <p className="note">Opcional: se o servidor pedir, confirme de novo por aqui.</p>}
        </>
      )}
      <label className="field"><span>Digite APAGAR para confirmar</span>
        <input value={word} autoCapitalize="characters" onChange={(e) => setWord(e.target.value)} /></label>
      {err && <p className="note err" role="alert">{err}</p>}
      <button className="btn danger" disabled={!canRun} onClick={run}>
        {busy ? "Apagando…" : "Apagar tudo"}
      </button>
    </Sheet>
  );
}
