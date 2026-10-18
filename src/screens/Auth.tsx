import { useState } from "react";
import { supabase } from "@/lib/supabase";

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
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === "up") {
        const { data, error } = await supabase.auth.signUp({
          email, password, options: { data: { name }, emailRedirectTo: location.origin },
        });
        if (error) throw error;
        if (!data.session) setMsg({ kind: "ok", text: "Confira seu e-mail para confirmar a conta." });
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin });
        if (error) throw error;
        setMsg({ kind: "ok", text: "Se houver uma conta, enviamos um link para redefinir a senha." });
      }
    } catch (err) {
      const m = (err as Error).message;
      setMsg({ kind: "err", text: m.includes("Invalid login") ? "E-mail ou senha incorretos." : m });
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
