import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages serves the site from /<repo>/; set BASE_PATH=/ for a custom domain.
  base: process.env.BASE_PATH ?? '/rn-size-check/',
  plugins: [react()],
  worker: { format: 'es' },
});
