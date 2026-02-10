import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    react(),
    //visualizer({
    //  open: true, // Open the visualization after build
    //  gzipSize: true,
    //  brotliSize: true
    //})
  ],
  worker: {
    format: 'es', // Enable ES module format for workers to support code-splitting
  },
  server: {
    host: '0.0.0.0',
    port: 3001, // Different from desktop and website
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@components': resolve(__dirname, './src/components'),
      '@utils': resolve(__dirname, './src/utils'),
      '@web': resolve(__dirname, './src/web'),
      '@desktop': resolve(__dirname, './src/desktop'),
      '@hooks': resolve(__dirname, './src/hooks'),
      '@contexts': resolve(__dirname, './src/contexts')
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    chunkSizeWarningLimit: 800, // Increase warning threshold
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // Heavy isolated dependencies get their own chunks
            if (id.includes('tesseract')) {
              return 'vendor-tesseract';
            }
            if (id.includes('jupyterlab')) {
              return 'vendor-jupyter';
            }
            if (id.includes('onnxruntime')) {
              return 'vendor-onnx';
            }
            // Let Vite handle the rest automatically
          }
        }
      }
    }
  },
});
