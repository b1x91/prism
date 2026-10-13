import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 로고·글꼴·아이콘은 웹과 함께 쓰는 packages/assets/public 에서. 앱에 그대로 묶여 들어간다.
export default defineConfig({
  plugins: [react()],
  publicDir: '../../packages/assets/public',
  clearScreen: false,
  server: { port: 5174, host: '127.0.0.1', strictPort: true },
  // 화면 둘: 앱 본 창(index.html), 게임 위 작은 창(overlay.html)
  build: { outDir: 'dist', target: 'es2022', chunkSizeWarningLimit: 1500, rollupOptions: { input: { main: 'index.html', overlay: 'overlay.html' } } },
});
