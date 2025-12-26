import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        '/api/volcengine': {
          target: 'https://openspeech.bytedance.com/api/v1/tts',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/volcengine/, '')
        },
        '/api/edge-tts-generate': {
          target: 'http://localhost:8000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/edge-tts-generate/, '/tts')
        },
        '/api/edge-tts-voices': {
          target: 'http://localhost:8000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/edge-tts-voices/, '/voices')
        }
      }
    },
    plugins: [
      react()
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
