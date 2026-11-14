import { Lock } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { api, tokens } from "../../services/api";

/** Minimal operator authentication for Mission Control and demo/admin tools (demo-grade, PIN based). */
export function OperatorGate({ children, title }: { children: ReactNode; title: string }) {
  const [authed, setAuthed] = useState(!!tokens.operator);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const expired = () => {
      setAuthed(false);
      setError("Operator session expired. Please sign in again.");
    };
    window.addEventListener("astra:operator-expired", expired);
    return () => window.removeEventListener("astra:operator-expired", expired);
  }, []);
  if (authed) return <>{children}</>;
  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6">
      <form
        className="panel flex w-full max-w-sm flex-col gap-4 p-6"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const r = await api.operatorLogin(pin);
            tokens.setOperator(r.token);
            setAuthed(true);
          } catch {
            setError("Invalid operator PIN");
          }
        }}
      >
        <div className="flex items-center gap-2">
          <Lock size={18} className="text-cyan-glow" />
          <h1 className="text-lg font-semibold">{title}</h1>
        </div>
        <p className="text-sm text-ink-muted">Authorized operators only. Demo PIN is set by ASTRA_OPERATOR_PIN (default 2026).</p>
        <input className="input" type="password" inputMode="numeric" autoFocus value={pin} onChange={(e) => setPin(e.target.value)} placeholder="Operator PIN" aria-label="Operator PIN" />
        {error && <p className="text-sm text-alert">{error}</p>}
        <button className="btn-primary">Sign in</button>
      </form>
    </div>
  );
}
