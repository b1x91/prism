// 배포 묶음 검사: 난독화가 import('…') 경로를 숨기면 Vite 가 그 모듈을 묶지 못하고, 앱에서 조용히 끊긴다
// (0.8.2~0.9.2 게임 위 작은 창·증강 인식이 이렇게 멈췄다). import(문자열표(번호)) 꼴이 있으면 빌드를 멈춘다.
import { readdirSync, readFileSync } from 'node:fs';
const dir = new URL('../dist/assets/', import.meta.url);
const bad = [];
for (const f of readdirSync(dir).filter((f) => f.endsWith('.js'))) {
  for (const m of readFileSync(new URL(f, dir), 'utf8').matchAll(/\bimport\(([^)]{0,40})/g)) {
    const arg = m[1].trim();
    if (/^[\w$]+\(/.test(arg)) bad.push(`${f}: import(${arg}`);
  }
}
if (bad.length) { console.error('난독화로 숨겨진 import 경로:\n' + bad.join('\n')); process.exit(1); }
console.log('묶음 검사 통과');
