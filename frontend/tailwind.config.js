/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        void: "#04070f",
        deep: "#070d1c",
        panel: "rgba(12, 22, 44, 0.62)",
        line: "rgba(120, 170, 255, 0.14)",
        cyan: { glow: "#5ee7ff", soft: "#8fdcff" },
        ok: "#4ade80",
        caution: "#fbbf24",
        alert: "#f87171",
        ink: { DEFAULT: "#e8eefc", muted: "#8b97b3", faint: "#5b6785" },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      keyframes: {
        breathe: { "0%,100%": { opacity: "0.55" }, "50%": { opacity: "1" } },
        scan: { "0%": { transform: "translateY(-100%)" }, "100%": { transform: "translateY(100%)" } },
      },
      animation: { breathe: "breathe 3.2s ease-in-out infinite", scan: "scan 2.4s linear infinite" },
    },
  },
  plugins: [],
};
