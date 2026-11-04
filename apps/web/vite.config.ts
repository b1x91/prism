import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import obfuscator from 'rollup-plugin-obfuscator';
import { readFileSync } from 'node:fs';

// 배포 빌드에서만 우리 코드(packages/core·ui, apps/web)를 난독화한다 (v3.107, 앱과 같은 방식 — apps/desktop/vite.config.ts).
// 웹은 누구나 받아 볼 수 있어 증강 어울림 표·티어 계산·문구가 그대로 읽혔다. 라이브러리·게임 데이터(JSON)는 그대로 (속도·크기).
// 완전한 암호화는 아니다 — 브라우저가 풀어 실행해야 하므로 문턱을 높이는 용도.
const OURS = /[\\/](packages[\\/](core|ui)[\\/]src|apps[\\/]web[\\/]src)[\\/].+\.(ts|tsx)$/;

// 로고·글꼴·아이콘은 앱과 함께 쓰는 packages/assets/public 에서
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    // 인터넷 없이 열었을 때의 안내 페이지와 그걸 띄우는 서비스 워커 (웹 배포판에만, v3.122)
    {
      name: 'prism-offline',
      apply: 'build' as const,
      generateBundle() {
        for (const f of ['sw.js', 'offline.html']) this.emitFile({ type: 'asset', fileName: f, source: readFileSync(new URL(`./static/${f}`, import.meta.url)) });
      },
    },
    command === 'build' && obfuscator({
      include: [OURS],
      exclude: [/node_modules/, /\.json$/],
      options: {
        compact: true,
        identifierNamesGenerator: 'hexadecimal',
        renameGlobals: false,
        stringArray: true,
        // 문자열은 섞인 배열에 모으되 인코딩은 하지 않는다 — base64 를 풀어 쓰는 비용이 화면 그리기 시간을 두 배로 늘렸다
        // (도감을 여는 데 느린 PC 에서 2초 넘게, 메뉴가 안 눌리는 것처럼 보임 · 2026-11-04 측정 2.3초 → 1.3초)
        stringArrayEncoding: [],
        stringArrayThreshold: 1,
        // import('…') 경로는 그대로 둔다. 숨기면 Vite 가 묶지 못해 실행할 때 모듈을 못 찾는다 (앱에서 겪은 문제)
        reservedStrings: ['^\\.{1,2}/', '\\.json$'],
        stringArrayRotate: true,
        stringArrayShuffle: true,
        splitStrings: false,
        // 웹은 첫 화면 속도가 중요해 흐름 섞기는 앱보다 가볍게
        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 0.1,
        deadCodeInjection: false,
        numbersToExpressions: false,
        selfDefending: false,
        debugProtection: false,
        disableConsoleOutput: false,
        transformObjectKeys: false,
        unicodeEscapeSequence: false,
        sourceMap: false,
      },
    }),
  ],
  publicDir: '../../packages/assets/public',
  server: { port: 5173, host: '127.0.0.1' },
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 4000 },
}));
