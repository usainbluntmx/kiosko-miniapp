// vite.config.ts
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  // Carga variables del .env (por si quieres usarlas aquí)
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react()],

    // ✅ SIN proxy local: todo va directo al Worker
    server: {
      host: true,        // útil para probar en red local (móvil)
      port: 5173,
      strictPort: true,
      // https: true,    // descomenta si requieres https local (p.ej., Wallets que lo pidan)
      // proxy: {}       // <— NO definir ningún proxy
    },

    preview: {
      host: true,
      port: 4173,
    },

    // (Opcional) Alias si usas "@/..."
    // resolve: {
    //   alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    // },

    // (Opcional) Si necesitas referenciar alguna env en build-time aquí:
    // define: {
    //   __ZEROX_PROXY__: JSON.stringify(env.VITE_ZEROX_PROXY_URL ?? ""),
    // },
  };
});