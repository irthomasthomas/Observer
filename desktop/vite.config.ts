import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import legacy from '@vitejs/plugin-legacy';

export default defineConfig(async () => ({
  plugins: [
    react(),
    legacy({
      targets: ['chrome >= 87', 'safari >= 13'],
      additionalLegacyPolyfills: ['regenerator-runtime/runtime'],
      polyfills: true
    })
  ],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    target: ["es2021", "chrome100", "safari13"],
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_DEBUG,
    assetsInclude: ['**/*.wasm'],
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('codemirror') || id.includes('lezer')) {
            return 'codemirror';
          }
        }
      }
    }
  }
}));
