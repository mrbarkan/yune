import { useState } from "react";
import {
  createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, updateProfile,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

const ERRORS: Record<string, string> = {
  "auth/invalid-credential": "E-mail ou senha incorretos.",
  "auth/wrong-password": "E-mail ou senha incorretos.",
  "auth/user-not-found": "E-mail ou senha incorretos.",
  "auth/email-already-in-use": "Já existe uma conta com este e-mail.",
  "auth/invalid-email": "E-mail inválido.",
  "auth/weak-password": "Senha fraca demais.",
  "auth/too-many-requests": "Muitas tentativas. Tente de novo em alguns minutos.",
};

export default function Auth() {
  const [mode, setMode] = useState<"in" | "up" | "reset">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const settings = { url: location.origin };
      if (mode === "in") {
        const { user } = await signInWithEmailAndPassword(auth, email, password);
        if (!user.emailVerified) {
          await sendEmailVerification(user, settings);
          await signOut(auth);
          setMsg({ kind: "ok", text: "Confirme seu e-mail para entrar. Enviamos o link de novo." });
        }
      } else if (mode === "up") {
        const { user } = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(user, { displayName: name });
        await sendEmailVerification(user, settings);
        await signOut(auth);
        setMsg({ kind: "ok", text: "Confira seu e-mail para confirmar a conta." });
        setMode("in");
      } else {
        await sendPasswordResetEmail(auth, email, settings).catch(() => {});
        setMsg({ kind: "ok", text: "Se houver uma conta, enviamos um link para redefinir a senha." });
      }
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      setMsg({ kind: "err", text: ERRORS[code] ?? (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <div className="auth-mark" aria-hidden>
        <svg viewBox="0 0 120 120" width="120" height="120">
          <circle cx="60" cy="60" r="52" className="am-track" />
          <path d="M60 8 A52 52 0 0 1 112 60" className="am-sleep" />
          <path d="M101 93 A52 52 0 0 1 75 110" className="am-move" />
          <circle cx="24" cy="86" r="6" className="am-food" />
          <circle cx="60" cy="60" r="3" className="am-core" />
        </svg>
      </div>
      <h1 className="wordmark">Yune</h1>
      <p className="auth-lede">Um dia por vez.<br />Comida, movimento, água e sono — num só gesto.</p>

      <form className="auth-form" onSubmit={submit}>
        {mode === "up" && (
          <label className="field">
            <span>Nome</span>
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" required />
          </label>
        )}
        <label className="field">
          <span>E-mail</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        {mode !== "reset" && (
          <label className="field">
            <span>Senha</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8}
              autoComplete={mode === "up" ? "new-password" : "current-password"} required />
          </label>
        )}
        {msg && <p className={`note ${msg.kind}`}>{msg.text}</p>}
        <button className="btn primary" disabled={busy}>
          {busy ? "…" : mode === "in" ? "Entrar" : mode === "up" ? "Criar conta" : "Enviar link"}
        </button>
      </form>

      <nav className="auth-switch">
        {mode !== "in" && <button onClick={() => setMode("in")}>Já tenho conta</button>}
        {mode !== "up" && <button onClick={() => setMode("up")}>Criar conta</button>}
        {mode === "in" && <button onClick={() => setMode("reset")}>Esqueci a senha</button>}
      </nav>
    </main>
  );
}
