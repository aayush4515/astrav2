import { Keyboard } from "lucide-react";
import { useState } from "react";
import type { Question } from "../../types";
import { useVoice } from "../voice/useVoice";
import { voice } from "../voice/VoiceEngine";

/**
 * Accessible alternative input. Visible only while ASTRA is listening; answering here resolves the
 * same listen() call the microphone would, so no collected data is lost if speech fails.
 */
export function ManualAnswer({ question, mode = "question" }: { question?: Question | null; mode?: "question" | "confirm" | "command" | "ready" | "greeting" }) {
  const v = useVoice();
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  if (!v.awaitingManual) return null;
  const send = (t: string) => {
    voice.provideManual(t);
    setText("");
  };
  const quick: string[] =
    mode === "confirm"
      ? ["Yes", "Not now", "Remind me later"]
      : mode === "ready"
        ? ["Sample ready"]
      : mode === "greeting"
        ? ["Cancel"]
      : mode === "command"
        ? ["Explain", "Show details", "What changed since yesterday?", "End check-in"]
        : question?.kind === "rating"
          ? ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]
          : question?.kind === "yes_no"
            ? ["Yes", "No"]
            : question?.kind === "choice"
              ? question.choices
              : question?.kind === "symptoms"
                ? ["No new symptoms", "Headache", "Dizziness", "Nausea", "Blurred vision"]
                : question?.kind === "free_mood"
                  ? ["Good", "Okay", "Tired", "Stressed"]
                  : [];
  const showAll = open || !v.micAvailable;
  return (
    <div className="flex flex-col items-center gap-2">
      {showAll ? (
        <>
          <div className="flex flex-wrap justify-center gap-1.5">
            {quick.map((q) => (
              <button key={q} className="btn-ghost px-3 py-1.5" onClick={() => send(q)}>
                {q}
              </button>
            ))}
          </div>
          <form
            className="flex w-full max-w-md gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) send(text.trim());
            }}
          >
            <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Type an answer…" aria-label="Type an answer" />
            <button className="btn-primary" type="submit">
              Send
            </button>
          </form>
        </>
      ) : (
        <button className="flex items-center gap-1.5 text-xs text-ink-faint hover:text-ink-muted" onClick={() => setOpen(true)}>
          <Keyboard size={13} /> Answer without voice
        </button>
      )}
    </div>
  );
}
