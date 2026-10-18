import { useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword, getRedirectResult, GoogleAuthProvider, OAuthProvider, reload, sendEmailVerification,
  sendPasswordResetEmail, signInWithEmailAndPassword, signInWithRedirect, signOut, updateProfile, type User,
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
  "auth/account-exists-with-different-credential": "Este e-mail já tem conta com outro jeito de entrar.",
  "auth/operation-not-allowed": "Este jeito de entrar ainda não está ativado.",
};

// Entrar com Apple depende de configuração na Apple (Services ID e chave); fica escondido até lá.
const APPLE_ENABLED = import.meta.env.VITE_APPLE_SIGNIN === "1";

// Redirect, não popup: no app instalado no iPhone o popup não consegue devolver o resultado.
function providerSignIn(kind: "google" | "apple") {
  if (kind === "google") {
    const p = new GoogleAuthProvider();
    p.setCustomParameters({ prompt: "select_account" });
    return signInWithRedirect(auth, p);
  }
  const p = new OAuthProvider("apple.com");
  p.addScope("email");
  p.addScope("name");
  p.setCustomParameters({ locale: "pt_BR" });
  return signInWithRedirect(auth, p);
}

const GoogleIcon = () => (
  <svg viewBox="0 0 48 48" aria-hidden>
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);

const AppleIcon = () => (
  <svg viewBox="0 0 384 512" aria-hidden>
    <path fill="currentColor" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
  </svg>
);

function Header() {
  return (
    <>
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
    </>
  );
}

const errorText = (err: unknown) => ERRORS[(err as { code?: string }).code ?? ""] ?? (err as Error).message;

const RESEND_WAIT_S = 60;

/** Conta criada, e-mail ainda não confirmado: reenviar o link ou checar de novo. */
function Verify({ user }: { user: User }) {
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(RESEND_WAIT_S);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function confirmed() {
    setBusy(true);
    setMsg(null);
    try {
      await reload(user);
      // O token novo leva email_verified para as regras do Firestore e faz o App trocar de tela.
      if (user.emailVerified) await user.getIdToken(true);
      else setMsg({ kind: "err", text: "Ainda não confirmado. Abra o link do e-mail e tente de novo." });
    } catch (err) {
      setMsg({ kind: "err", text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    setMsg(null);
    try {
      await sendEmailVerification(user, { url: location.origin });
      setMsg({ kind: "ok", text: "Enviamos outro link." });
      setWait(RESEND_WAIT_S);
    } catch (err) {
      setMsg({ kind: "err", text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <Header />
      <p className="auth-lede">Confirme seu e-mail.<br />Enviamos um link para {user.email}.</p>
      <div className="auth-form">
        <p className="note">Abra o link e volte aqui. Não chegou? Veja a pasta Spam.</p>
        {msg && <p className={`note ${msg.kind}`}>{msg.text}</p>}
        <button className="btn primary" disabled={busy} onClick={confirmed}>{busy ? "…" : "Já confirmei"}</button>
        <button className="btn ghost" disabled={busy || wait > 0} onClick={resend}>
          {wait > 0 ? `Reenviar e-mail em ${wait}s` : "Reenviar e-mail"}
        </button>
      </div>
      <nav className="auth-switch">
        <button onClick={() => signOut(auth)}>Usar outra conta</button>
      </nav>
    </main>
  );
}

export default function Auth({ user }: { user: User | null }) {
  if (user) return <Verify user={user} />;
  return <SignIn />;
}

function SignIn() {
  const [mode, setMode] = useState<"in" | "up" | "reset">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Volta do Google/Apple: o login em si chega pelo App (onIdTokenChanged); aqui só os erros.
  useEffect(() => {
    getRedirectResult(auth).catch((err) => setMsg({ kind: "err", text: errorText(err) }));
  }, []);

  async function withProvider(kind: "google" | "apple") {
    setBusy(true);
    setMsg(null);
    try {
      await providerSignIn(kind);
    } catch (err) {
      setMsg({ kind: "err", text: errorText(err) });
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const settings = { url: location.origin };
      // Sem e-mail confirmado, o App mostra a tela de confirmação (Verify).
      if (mode === "in") {
        await signInWithEmailAndPassword(auth, email, password);
      } else if (mode === "up") {
        const { user } = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(user, { displayName: name });
        await sendEmailVerification(user, settings);
      } else {
        await sendPasswordResetEmail(auth, email, settings).catch(() => {});
        setMsg({ kind: "ok", text: "Se houver uma conta, enviamos um link para redefinir a senha." });
      }
    } catch (err) {
      setMsg({ kind: "err", text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <Header />
      <p className="auth-lede">Um dia por vez.<br />Comida, movimento, água e sono — num só gesto.</p>

      {mode !== "reset" && (
        <>
          <div className="auth-providers">
            <button type="button" className="btn provider" disabled={busy} onClick={() => withProvider("google")}>
              <GoogleIcon />Entrar com Google
            </button>
            {APPLE_ENABLED && (
              <button type="button" className="btn provider" disabled={busy} onClick={() => withProvider("apple")}>
                <AppleIcon />Entrar com Apple
              </button>
            )}
          </div>
          <p className="auth-or">ou com e-mail</p>
        </>
      )}

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
