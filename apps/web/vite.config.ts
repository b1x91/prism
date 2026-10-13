import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 로고·글꼴·아이콘은 앱과 함께 쓰는 packages/assets/public 에서
export default defineConfig({
  plugins: [react()],
  publicDir: '../../packages/assets/public',
  server: { port: 5173, host: '127.0.0.1' },
  build: { outDir: 'dist', chunkSizeWarningLimit: 1500 },
});
