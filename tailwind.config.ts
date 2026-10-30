import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        shell: "#101113", panel: "#17191c", raised: "#1e2125", line: "#2a2e33", muted: "#858b93", accent: "#d6f36a",
      },
      fontFamily: { sans: ["Inter", "Segoe UI", "sans-serif"], mono: ["Cascadia Code", "Consolas", "monospace"] },
    },
  },
  plugins: [],
} satisfies Config;
