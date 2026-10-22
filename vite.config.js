import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  define: {
    // ties browser error reports to the deployed commit
    __RELEASE__: JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA || "dev"),
  },
  build: {
    rollupOptions: {
      output: {
        // vendor code changes rarely — keep it in long-cached chunks separate from app code
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          supabase: ["@supabase/supabase-js"],
        },
      },
    },
  },
});
