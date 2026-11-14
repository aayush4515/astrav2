import { AnimatePresence, motion } from "framer-motion";
import { useVoice } from "./useVoice";

/** Spoken instructions and transcribed answers, shown as readable text. */
export function Captions({ max = 3 }: { max?: number }) {
  const { captions } = useVoice();
  const shown = captions.slice(-max);
  return (
    <div className="flex w-full flex-col gap-2" aria-live="polite">
      <AnimatePresence initial={false}>
        {shown.map((c, i) => {
          const latest = i === shown.length - 1;
          return (
            <motion.div
              key={c.at + c.text}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: latest ? 1 : 0.45, y: 0 }}
              exit={{ opacity: 0 }}
              className={c.speaker === "astra" ? "text-left" : "text-right"}
            >
              <span className="label mr-2">{c.speaker === "astra" ? "ASTRA" : "You"}</span>
              <span className={c.speaker === "astra" ? "text-lg text-ink md:text-xl" : "text-lg italic text-ok md:text-xl"}>
                {c.speaker === "astronaut" ? `“${c.text}”` : c.text}
              </span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
