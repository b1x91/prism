/**
 * 챔피언·증강 아이콘을 CommunityDragon 에서 받아 packages/assets/public/img 에 둔다 (웹·앱이 함께 묶어 넣는다).
 * 이미 있는 파일은 다시 받지 않는다. 저장소에는 올리지 않는다 (빌드 때 받는다).
 * 챔프 아이콘은 Riot 원본 둘레에 검은 테두리(4~6px)가 그려져 있어, 둥근 칸에 넣으면 가장자리에 검은 선이 보인다 →
 * 둘레 CHAMP_TRIM px 를 잘라 champ2/ 에 둔다 (폴더 이름을 바꿔 예전 그림이 브라우저 캐시에서 나오지 않게).
 *   npm run icons
 */
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'packages', 'assets', 'public', 'img');
const DATA = join(ROOT, 'packages', 'core', 'data');
const CDN = (branch) => `https://raw.communitydragon.org/${branch}/plugins/rcp-be-lol-game-data/global/default/`;
const CDRAGON = CDN('latest');
const CHAMP_TRIM = 6;

const augs = JSON.parse(await readFile(join(DATA, 'mayhem-augments.json'), 'utf8')).augments;
const champs = JSON.parse(await readFile(join(DATA, 'mayhem-champions.json'), 'utf8')).champions;
const jobs = [
  ...Object.keys(champs).map((id) => ({ url: `${CDRAGON}v1/champion-icons/${id}.png`, out: `champ2/${id}.png`, trim: CHAMP_TRIM })),
  // 다음 패치에만 있는 증강은 PBE, 빠진 증강은 마지막으로 보인 패치 폴더에서 (v3.101)
  ...augs.filter((a) => a.icon).map((a) => {
    const path = a.icon.replace('/lol-game-data/assets/', '').toLowerCase();
    return { urls: [CDRAGON, ...(a.seen ? [CDN(a.seen)] : []), CDN('pbe')].map((base) => base + path), out: `aug/${a.id}.png` };
  }),
];
const exists = (p) => access(p).then(() => true, () => false);
let fetched = 0;
const failed = [];
async function one(j) {
  const file = join(OUT, j.out);
  if (await exists(file)) return;
  for (let i = 0; ; i++) {
    try {
      let r = null;
      for (const url of j.urls ?? [j.url]) {
        r = await fetch(url, { signal: AbortSignal.timeout(30_000) });
        if (r.ok) break;
      }
      if (!r?.ok) throw new Error(String(r?.status));
      await mkdir(dirname(file), { recursive: true });
      let buf = Buffer.from(await r.arrayBuffer());
      if (j.trim) {
        const img = sharp(buf);
        const { width, height } = await img.metadata();
        buf = await img.extract({ left: j.trim, top: j.trim, width: width - 2 * j.trim, height: height - 2 * j.trim }).png().toBuffer();
      }
      await writeFile(file, buf);
      fetched++;
      return;
    } catch (e) {
      if (i >= 2) { failed.push(`${j.out} (${e.message})`); return; }
      await new Promise((ok) => setTimeout(ok, 1500 * (i + 1)));
    }
  }
}
for (let i = 0; i < jobs.length; i += 12) await Promise.all(jobs.slice(i, i + 12).map(one));
console.log(`아이콘 ${jobs.length}개 준비 (새로 받음 ${fetched})`);
if (failed.length) { console.error(`실패 ${failed.length}개: ${failed.slice(0, 10).join(', ')}`); process.exitCode = 1; }
