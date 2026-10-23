import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

// Hashed build output lives under /~static/ ("~" never starts a repository
// name); wrangler serves it straight from the edge (run_worker_first excludes it).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    outDir: 'dist',
    // hashed files under /~static/a/ get immutable caching (public/_headers); /~static/prefs.js revalidates
    assetsDir: '~static/a',
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // long-lived vendor chunks: an app-only deploy keeps react / motion cached
        manualChunks: { react: ['react', 'react-dom', 'react-router'], motion: ['motion', 'motion/react'] },
      },
    },
  },
});
