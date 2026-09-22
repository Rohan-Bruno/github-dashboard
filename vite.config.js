import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base:'./' keeps asset paths relative, so the built dist/ works whether it's served
// from a GitHub Pages subpath or unzipped from a workflow artifact.
export default defineConfig({
  plugins: [react()],
  base: './',
});
