import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  plugins: [react(),
            visualizer({
              open: true, // Open the visualization after build
              gzipSize: true,
              brotliSize: true
                      })
            ],
  server: {
    host: '0.0.0.0', 
    port: 5174, // Different from desktop and website
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
