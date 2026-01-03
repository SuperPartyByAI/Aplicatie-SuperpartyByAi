import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Get commit SHA
const getCommitSha = () => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'unknown';
  }
};

// Get build time in RO format: DD.MM.YYYY HH:mm UTC
const getBuildTime = () => {
  const now = new Date();
  const day = String(now.getUTCDate()).padStart(2, '0');
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const year = now.getUTCFullYear();
  const hours = String(now.getUTCHours()).padStart(2, '0');
  const minutes = String(now.getUTCMinutes()).padStart(2, '0');
  return `${day}.${month}.${year} ${hours}:${minutes} UTC`;
};

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'html-transform',
      transformIndexHtml(html) {
        return html.replace(/%VITE_BUILD_TIME%/g, getBuildTime());
      },
    },
    {
      name: 'generate-version-json',
      closeBundle() {
        const versionData = {
          build: getCommitSha(),
          ts: new Date().toISOString(),
        };
        const outputPath = path.resolve(process.cwd(), 'dist', 'version.json');
        fs.writeFileSync(outputPath, JSON.stringify(versionData, null, 2));
        console.log('✅ Generated version.json:', versionData);
      },
    },
  ],
  define: {
    'import.meta.env.VITE_COMMIT_SHA': JSON.stringify(getCommitSha()),
    'import.meta.env.VITE_BUILD_TIME': JSON.stringify(getBuildTime()),
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: ['.gitpod.dev', '.gitpod.io'],
    proxy: {
      '/api/whatsapp': {
        target: 'https://whats-upp-production.up.railway.app',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          firebase: [
            'firebase/app',
            'firebase/auth',
            'firebase/firestore',
            'firebase/storage',
            'firebase/functions',
          ],
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
});
