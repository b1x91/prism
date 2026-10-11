/**
 * 공개 사이트 빌드: site/ → site/dist (Firebase Hosting 이 올리는 폴더)
 *   npm run site:build
 * - site/src/main.ts 를 한 파일로 묶는다 (게임 데이터 JSON 포함)
 * - 챔피언·증강 아이콘은 CommunityDragon 에서 받아 함께 올린다 (site/.cache 에 보관, 다음 빌드는 재사용)
 *   큰 일러스트는 화면에서 CommunityDragon 주소로 바로 불러온다
 */
import { build } from 'esbuild';
import { copyFile, mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, 'site'), DIST = join(SITE, 'dist'), CACHE = join(SITE, '.cache');
const CDRAGON = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/';

await mkdir(join(DIST, 'brand'), { recursive: true });
await mkdir(join(DIST, 'fonts'), { recursive: true });
await build({ entryPoints: [join(SITE, 'src', 'main.ts')], bundle: true, minify: true, format: 'iife', target: 'es2020', outfile: join(DIST, 'app.js'), logLevel: 'warning' });
await copyFile(join(SITE, 'index.html'), join(DIST, 'index.html'));
for (const f of ['prism-32.png', 'prism-64.png', 'prism-128.png', 'prism-256.png']) await copyFile(join(ROOT, 'app', 'public', 'brand', f), join(DIST, 'brand', f));
await copyFile(join(ROOT, 'app', 'public', 'brand', 'prism-256.png'), join(DIST, 'brand', 'og-v1.png'));
await copyFile(join(ROOT, 'app', 'public', 'fonts', 'PretendardVariable.woff2'), join(DIST, 'fonts', 'PretendardVariable.woff2'));
await copyFile(join(ROOT, 'app', 'public', 'fonts', 'Pretendard-LICENSE.txt'), join(DIST, 'fonts', 'Pretendard-LICENSE.txt'));

// 아이콘
const augs = JSON.parse(await readFile(join(ROOT, 'app', 'data', 'mayhem-augments.json'), 'utf8')).augments;
const champs = JSON.parse(await readFile(join(ROOT, 'app', 'data', 'mayhem-champions.json'), 'utf8')).champions;
const jobs = [
  ...Object.keys(champs).map((id) => ({ url: `${CDRAGON}v1/champion-icons/${id}.png`, out: `img/champ/${id}.png` })),
  ...augs.filter((a) => a.icon).map((a) => ({ url: CDRAGON + a.icon.replace('/lol-game-data/assets/', '').toLowerCase(), out: `img/aug/${a.id}.png` })),
];
let fetched = 0, failed = [];
const exists = (p) => access(p).then(() => true, () => false);
async function one(j) {
  const cached = join(CACHE, j.out);
  if (!(await exists(cached))) {
    for (let i = 0; ; i++) {
      try {
        const r = await fetch(j.url, { signal: AbortSignal.timeout(30_000) });
        if (!r.ok) throw new Error(String(r.status));
        await mkdir(dirname(cached), { recursive: true });
        await writeFile(cached, Buffer.from(await r.arrayBuffer()));
        fetched++;
        break;
      } catch (e) {
        if (i >= 2) { failed.push(`${j.out} (${e.message})`); return; }
        await new Promise((ok) => setTimeout(ok, 1500 * (i + 1)));
      }
    }
  }
  await mkdir(dirname(join(DIST, j.out)), { recursive: true });
  await copyFile(cached, join(DIST, j.out));
}
for (let i = 0; i < jobs.length; i += 12) await Promise.all(jobs.slice(i, i + 12).map(one));
console.log(`사이트 빌드 완료 → site/dist · 아이콘 ${jobs.length}개 (새로 받음 ${fetched})`);
if (failed.length) { console.error(`아이콘 실패 ${failed.length}개: ${failed.slice(0, 10).join(', ')}`); process.exitCode = 1; }
