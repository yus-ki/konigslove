import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    base: './',
    build: {
      chunkSizeWarningLimit: 2000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              // Core React ecosystem
              if (id.includes('/node_modules/react/') || 
                  id.includes('/node_modules/react-dom/') || 
                  id.includes('/node_modules/scheduler/')) {
                return 'react-core';
              }
              // Large animation library
              if (id.includes('framer-motion') || id.includes('motion')) {
                return 'framer-motion';
              }
              // Icons
              if (id.includes('lucide-react')) {
                return 'lucide-react';
              }
              // AI dependencies
              if (id.includes('@google/genai')) {
                return 'genai';
              }
              // All other general dependencies
              return 'vendor';
            }
          },
        },
      },
    },
  };
});
