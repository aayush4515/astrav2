/** @type {import('tailwindcss').Config} */
// Guide Map world: flat land on cream water, capsule controls, one grotesk at one weight.
const ONE_WEIGHT = "600";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    fontWeight: {
      light: ONE_WEIGHT,
      normal: ONE_WEIGHT,
      medium: ONE_WEIGHT,
      semibold: ONE_WEIGHT,
      bold: ONE_WEIGHT,
    },
    extend: {
      colors: {
        water: "#F5F1E4",
        land: "#8ED462",
        sheet: "#FFFFFF",
        ink: { DEFAULT: "#2C2E2A", soft: "#4A4D46", faint: "#5E6158" },
        rule: "rgba(44, 46, 42, 0.14)",
        cap: { yellow: "#F5E211", coral: "#FF705D", blue: "#2BA0FF", lilac: "#EBC1FF" },
        // Health status: own deep tones, always paired with a shape mark and words.
        st: { clear: "#1E6B35", watch: "#8A5A00", review: "#B23E0A", urgent: "#C8102E" },
      },
      fontFamily: {
        sans: ["Inter Variable", "Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      letterSpacing: { map: "-0.06em" },
      lineHeight: { map: "0.95" },
      keyframes: {
        breathe: { "0%,100%": { opacity: "0.55" }, "50%": { opacity: "1" } },
        scan: { "0%": { transform: "translateY(-100%)" }, "100%": { transform: "translateY(100%)" } },
      },
      animation: { breathe: "breathe 3.2s ease-in-out infinite", scan: "scan 2.4s linear infinite" },
    },
  },
  plugins: [],
};
