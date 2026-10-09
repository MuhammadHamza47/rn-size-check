import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // Served from the domain root (Vercel). Set BASE_PATH=/rn-size-check/ to host under a sub-path (GitHub Pages).
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  worker: { format: 'es' },
});
