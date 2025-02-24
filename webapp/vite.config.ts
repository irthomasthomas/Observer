import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174, // Different from desktop and website
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
