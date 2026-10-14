import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import obfuscator from 'rollup-plugin-obfuscator';

// 배포 빌드에서만 우리 코드(packages/core·ui, apps/desktop)를 난독화한다.
// 이름·문자열·흐름을 섞어 설치 파일을 풀어도 구조를 읽기 어렵게. 라이브러리·게임 데이터(JSON)는 그대로 (속도·크기).
// 완전한 암호화는 아니다 — 앱이 스스로 풀어 실행해야 하므로 시간을 들이면 되돌릴 수 있다. 문턱을 높이는 용도.
const OURS = /[\\/](packages[\\/](core|ui)[\\/]src|apps[\\/]desktop[\\/]src)[\\/].+\.(ts|tsx)$/;

// 로고·글꼴·아이콘은 웹과 함께 쓰는 packages/assets/public 에서. 앱에 그대로 묶여 들어간다.
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    command === 'build' && obfuscator({
      include: [OURS],
      exclude: [/node_modules/, /\.json$/],
      options: {
        compact: true,
        identifierNamesGenerator: 'hexadecimal',
        renameGlobals: false,
        stringArray: true,
        stringArrayEncoding: ['base64'],
        stringArrayThreshold: 1,
        stringArrayRotate: true,
        stringArrayShuffle: true,
        splitStrings: false,
        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 0.2,
        deadCodeInjection: false,
        numbersToExpressions: false,
        selfDefending: false,
        debugProtection: false,
        disableConsoleOutput: true,
        transformObjectKeys: false,
        unicodeEscapeSequence: false,
        sourceMap: false,
      },
    }),
  ],
  publicDir: '../../packages/assets/public',
  clearScreen: false,
  server: { port: 5174, host: '127.0.0.1', strictPort: true },
  // 화면 둘: 앱 본 창(index.html), 게임 위 작은 창(overlay.html). 소스맵은 만들지 않는다.
  build: { outDir: 'dist', target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 4000, rollupOptions: { input: { main: 'index.html', overlay: 'overlay.html' } } },
}));
