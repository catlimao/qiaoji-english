import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f7f4ef",
          100: "#efe8dc",
          200: "#ddd0b8",
          300: "#c4b08e",
          400: "#a89068",
          500: "#8f754f",
          600: "#735c40",
          700: "#5c4a36",
          800: "#4c3e30",
          900: "#40352a",
          950: "#231c16",
        },
        accent: {
          DEFAULT: "#c45c26",
          soft: "#f3e0d4",
          deep: "#9a3f14",
        },
        paper: {
          DEFAULT: "#faf6f0",
          lined: "#f3ebe0",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        "paper-grain":
          "radial-gradient(ellipse at 20% 0%, rgba(196,92,38,0.06), transparent 50%), radial-gradient(ellipse at 80% 100%, rgba(115,92,64,0.05), transparent 45%)",
      },
    },
  },
  plugins: [],
};

export default config;
