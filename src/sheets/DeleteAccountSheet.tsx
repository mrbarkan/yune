import { useState } from "react";
import {
  EmailAuthProvider, GoogleAuthProvider, OAuthProvider, reauthenticateWithCredential, reauthenticateWithPopup, signOut,
} from "firebase/auth";
import { Sheet } from "@/components/Sheet";
import { auth, deleteAccount } from "@/lib/firebase";
import { disablePushQuietly } from "@/lib/push";

const REAUTH_FAIL = "Não foi possível confirmar. Saia, entre de novo e volte aqui em até 10 minutos.";

type Method = "password" | "google" | "apple";

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
  const [done, setDone] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const wordOk = word.trim().toUpperCase() === "APAGAR";
  const canRun = wordOk && !busy && (method === "password" ? pw.length > 0 : confirmed);

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
      if (method === "password" && (c === "auth/wrong-password" || c === "auth/invalid-credential")) return "Senha incorreta.";
      return method === "password" ? "Não foi possível confirmar a senha agora. Tente de novo." : REAUTH_FAIL;
    }
  }

  async function confirmProvider() {
    setBusy(true);
    setErr("");
    try {
      const bad = await reauth();
      if (bad) setErr(bad);
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
        if (bad) { setErr(bad); return; }
      }
      await disablePushQuietly();
      const res = await deleteAccount();
      if (res.ok) setDone(true);
      else setErr(res.reauth ? REAUTH_FAIL : (res.error ?? "Não foi possível apagar agora. Tente de novo."));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Sheet title="Apagar minha conta" onClose={() => void signOut(auth)}>
        <p>Conta apagada. Obrigado por ter usado o Yune.</p>
        <button className="btn" onClick={() => void signOut(auth)}>Fechar</button>
      </Sheet>
    );
  }

  return (
    <Sheet title="Apagar minha conta" onClose={onClose}>
      <p>Isto apaga para sempre seu perfil, seus registros, fotos, exames, dietas e lembretes, e cancela o Pro na hora, sem cobranças futuras. Não dá para desfazer.</p>
      <p className="note">Se quiser guardar uma cópia, use antes “Baixar tudo (.zip)”.</p>
      {method === "password" ? (
        <label className="field"><span>Sua senha</span>
          <input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
      ) : (
        <button className="btn ghost" disabled={busy || confirmed} onClick={confirmProvider}>
          {confirmed ? "Acesso confirmado" : `Confirmar com ${method === "google" ? "Google" : "Apple"}`}
        </button>
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
