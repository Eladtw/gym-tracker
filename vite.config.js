import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(), // ← הוספת תמיכה מלאה ב-Tailwind v4
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"), // קיצור נוח ל-import
    },
  },
});

