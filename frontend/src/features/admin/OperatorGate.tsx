import { Lock } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { api, tokens } from "../../services/api";
import { Lobe } from "../../components/Lobe";

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
    <div className="relative flex min-h-[78vh] items-center justify-center overflow-hidden p-6">
      <Lobe seed={17} swell={0.14} square={0.4} hole={{ cx: 50, cy: 50, rx: 30, ry: 34 }} className="inset-x-[4%] inset-y-[2%] md:inset-x-[16%]" />
      <form
        className="sheet relative flex w-full max-w-sm flex-col gap-4 p-7"
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
        <Lock size={22} />
        <h1 className="text-[30px] leading-[1.02] tracking-[-0.045em]">{title}</h1>
        <p className="text-[15px] leading-snug text-ink-soft">Authorized operators only. Demo PIN is set by ASTRA_OPERATOR_PIN (default 2026).</p>
        <input className="input" type="password" inputMode="numeric" autoFocus value={pin} onChange={(e) => setPin(e.target.value)} placeholder="Operator PIN" aria-label="Operator PIN" />
        {error && <p className="text-[15px] text-st-urgent" role="alert">{error}</p>}
        <button className="btn-primary">Sign in</button>
      </form>
    </div>
  );
}
