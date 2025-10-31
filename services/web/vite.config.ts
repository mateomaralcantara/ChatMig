import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Solo exposa variables que empiecen por VITE_
  envPrefix: ["VITE_"],
  server: {
    host: true,          // permite acceder por IP/LAN
    port: 5173,
    strictPort: true,    // no cambia de puerto si 5173 está ocupado
    open: false,
    // Proxy hacia tu API FastAPI (evita CORS en dev)
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    port: 5173,
    strictPort: true,
  },
  build: {
    target: "esnext",
    sourcemap: true,     // útil para depurar (puedes poner false en prod)
    outDir: "dist",
    emptyOutDir: true,
  },
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? "dev"),
  },
});

