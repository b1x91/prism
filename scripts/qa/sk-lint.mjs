// 자리표시 뼈대 클래스 잘못 쓰기 막기 (CLAUDE.md v3.179) — `npm run build` 가 함께 돌린다.
// `.sk` 는 뼈대 한 조각(빛이 지나가는 회색 막대)이다. 안에 다른 요소를 품은 칸(줄·카드)에 `sk` 를 붙이면
// 칸 전체가 하나의 큰 뼈대로 그려지고, 안의 뼈대와 겹쳐 화면이 뭉개진다 (홈 랭킹·오늘의 아이템, 2026-11-06).
// 칸에는 `sk-row`·`xx-sk` 같은 다른 이름을 쓰고, 뼈대는 `<Bone />` 이나 닫힌 요소(`<i className="sk …" />`)로만.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
const roots = ['packages/ui/src', 'apps/desktop/src', 'apps/web/src'];
const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx$/.test(f)) files.push(p); } };
roots.forEach(walk);
const bad = [];
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  // 여는 태그 하나씩: <tag ... className="...">  (닫힌 태그 <... /> 는 뼈대 조각이라 괜찮다)
  const re = /<([a-zA-Z][\w.]*)\b([^<>]*?(?:\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}[^<>]*?)*)(\/?)>/g;
  let m;
  while ((m = re.exec(src))) {
    const [, tag, attrs, selfClose] = m;
    if (selfClose || tag === 'Bone') continue;
    const cls = attrs.match(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{'([^']*)'\})/);
    if (!cls) continue;
    const v = (cls[1] ?? cls[2] ?? cls[3]).replace(/\$\{[^}]*\}/g, ' ');
    if (/(^|\s)sk(\s|$)/.test(v)) bad.push(`${f}:${src.slice(0, m.index).split('\n').length}  <${tag} className="${v.trim()}">`);
  }
}
if (bad.length) {
  console.error('자리표시 뼈대 클래스(sk)를 안에 요소를 품은 칸에 썼어요. 칸은 sk-row 같은 다른 이름으로, 뼈대는 <Bone /> 로:\n' + bad.join('\n'));
  process.exit(1);
}
console.log(`sk-lint: ${files.length}개 파일 통과`);
