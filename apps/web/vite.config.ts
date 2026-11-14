import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  base: process.env.VITE_BASE ?? "/",
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  worker: { format: "es" },
  build: {
    target: "es2022",
    rollupOptions: {
      output: {
        // keep the 3D engine and charts out of the landing-page bundle
        manualChunks: { three: ["three", "@react-three/fiber", "@react-three/drei"] },
      },
    },
  },
})
